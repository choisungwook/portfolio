"""03-registry-lineage.ipynb의 등록과 재현 확인을 Kubeflow Pipelines로 자동화한다.

책 5장처럼 학습은 KFP가 실행하고, 모델 버전과 alias는 MLflow 모델 레지스트리에 둔다.
run마다 새 버전이 생기고, alias champion은 점수가 지금 champion보다 높을 때만 옮긴다.
"""
from typing import NamedTuple

from kfp import dsl, kubernetes
from kfp.dsl import Dataset, Input, Model

from common import BASE_IMAGE, XGBOOST, load_data, prepare_data, submit, train_model, wait

MLFLOW = "mlflow==3.17.2"
MODEL_NAME = "income-classifier"


@dsl.component(base_image=BASE_IMAGE, packages_to_install=[MLFLOW, XGBOOST])
def register_model(model: Input[Model], test: Input[Dataset], model_name: str, kfp_run_id: str) -> NamedTuple(
    "Registered", version=str, champion=str):
  """모델을 MLflow run으로 기록하고 레지스트리에 새 버전으로 등록한다. 점수가 champion보다 높으면 alias를 옮긴다."""
  import pickle

  import mlflow
  import pandas as pd
  import xgboost as xgb
  from mlflow import MlflowClient
  from sklearn.metrics import roc_auc_score

  with open(model.path, "rb") as f:
    booster = pickle.load(f)
  test_df = pd.read_csv(test.path)
  x_test, y_test = test_df.drop(columns="Target"), test_df.Target
  score = float(roc_auc_score(y_test, booster.predict(xgb.DMatrix(x_test))))

  mlflow.set_experiment("income-classifier")
  with mlflow.start_run(run_name="kfp-xgboost"):
    mlflow.set_tag("kfp_run_id", kfp_run_id)
    mlflow.log_metric("roc_auc_score_test", score)
    info = mlflow.xgboost.log_model(booster, name="income-classifier", input_example=x_test.head(3))
  version = mlflow.register_model(info.model_uri, model_name).version

  client = MlflowClient()
  try:
    champion = client.get_model_version_by_alias(model_name, "champion")
    best = client.get_run(champion.run_id).data.metrics["roc_auc_score_test"]
  except mlflow.exceptions.MlflowException:
    champion, best = None, -1.0
  if score > best:
    client.set_registered_model_alias(model_name, "champion", version)
    champion_version = version
  else:
    champion_version = champion.version
  print(f"registered v{version} score={score:.6f} champion=v{champion_version} best={best:.6f}")
  return (str(version), str(champion_version))


@dsl.component(base_image=BASE_IMAGE, packages_to_install=[MLFLOW, XGBOOST])
def verify_champion(test: Input[Dataset], model_name: str, champion: str):
  """models:/<이름>@champion을 내려받아 테스트 데이터로 다시 채점하고, 기록된 점수와 같은지 확인한다."""
  import mlflow
  import pandas as pd
  from mlflow import MlflowClient
  from sklearn.metrics import roc_auc_score

  test_df = pd.read_csv(test.path)
  loaded = mlflow.pyfunc.load_model(f"models:/{model_name}@champion")
  score = float(roc_auc_score(test_df.Target, loaded.predict(test_df.drop(columns="Target"))))
  client = MlflowClient()
  logged = client.get_run(client.get_model_version(model_name, champion).run_id).data.metrics["roc_auc_score_test"]
  print(f"champion=v{champion} logged={logged:.6f} rescored={score:.6f}")
  if abs(logged - score) > 1e-6:
    raise ValueError(f"champion v{champion} score changed: logged={logged} rescored={score}")


@dsl.pipeline(name="income-register", description="XGBoost를 학습해 MLflow 레지스트리에 등록하고 champion을 검증한다")
def income_register_pipeline(model_name: str = MODEL_NAME):
  """학습한 모델을 등록하고, 등록 결과가 가리키는 champion을 다시 채점한다."""
  data_task = load_data()
  split_task = prepare_data(data=data_task.outputs["data"])
  train_task = train_model(model_type="xgboost", train=split_task.outputs["train"], test=split_task.outputs["test"])
  register_task = register_model(model=train_task.outputs["model"], test=split_task.outputs["test"],
                                 model_name=model_name, kfp_run_id=dsl.PIPELINE_JOB_ID_PLACEHOLDER)
  verify_task = verify_champion(test=split_task.outputs["test"], model_name=model_name,
                                champion=register_task.outputs["champion"])
  for task in [register_task, verify_task]:
    # PodDefault mlflow-access가 이 label이 붙은 파드에 MLflow 주소와 object storage 계정을 넣는다.
    kubernetes.add_pod_label(task, "mlflow-access", "true")
    task.set_caching_options(False)


if __name__ == "__main__":
  wait([submit(income_register_pipeline, "register")])
