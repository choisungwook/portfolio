"""Lab 1 KFP 파이프라인 3개가 같이 쓰는 컴포넌트와 제출 함수.

컴포넌트 함수는 컴파일할 때 소스가 그대로 파이프라인 YAML에 들어가고, 각자 파드에서 실행된다.
그래서 컴포넌트 안에서는 이 파일의 다른 함수나 income.py를 import하지 않는다.
"""
from typing import Callable

import kfp
from kfp import dsl
from kfp.dsl import Dataset, Input, Metrics, Model, Output

# 노트북과 같은 이미지. 노드에 이미 받아 둔 이미지라 컴포넌트 파드가 빨리 뜨고, pandas와 scikit-learn이 들어 있다.
BASE_IMAGE = "ghcr.io/kubeflow/kubeflow/notebook-servers/jupyter-scipy:v1.11.0"
XGBOOST = "xgboost==3.4.1"
EXPERIMENT = "income-classifier"
NAMESPACE_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/namespace"


@dsl.component(base_image=BASE_IMAGE)
def load_data(data: Output[Dataset]):
  """UCI Adult에서 책과 같은 30,162행 데이터셋을 만들어 KFP 아티팩트로 남긴다. income.py의 load_income_data와 같은 처리다."""
  import pandas as pd

  url = "https://archive.ics.uci.edu/ml/machine-learning-databases/adult/adult.data"
  columns = ["age", "Workclass", "fnlwgt", "Education", "education-num", "Marital-Status", "Occupation",
             "Relationship", "Race", "Sex", "capital-gain", "capital-loss", "hours-per-week", "Native_country", "Target"]
  categorical = ["Workclass", "Education", "Marital-Status", "Occupation", "Relationship", "Race", "Sex", "Native_country"]
  raw = pd.read_csv(url, header=None, names=columns)
  df = raw[categorical + ["Target"]]
  df = df[~df.apply(lambda col: col.str.strip() == "?").any(axis=1)]
  df.to_csv(data.path, index=False)
  data.metadata.update({"rows": len(df), "source": url})


@dsl.component(base_image=BASE_IMAGE)
def prepare_data(data: Input[Dataset], train: Output[Dataset], test: Output[Dataset]):
  """02-experiments.ipynb와 같은 one-hot 인코딩과 8:2 분할(random_state=42)로 학습, 테스트 데이터를 만든다."""
  import pandas as pd
  from sklearn.model_selection import train_test_split

  df = pd.read_csv(data.path)
  x = pd.get_dummies(df.drop("Target", axis=1), drop_first=True, dtype=float)
  x["Target"] = (df.Target.str.strip() == ">50K").astype(int)
  train_df, test_df = train_test_split(x, train_size=0.8, shuffle=True, random_state=42)
  train_df.to_csv(train.path, index=False)
  test_df.to_csv(test.path, index=False)
  train.metadata["columns"] = x.shape[1] - 1


@dsl.component(base_image=BASE_IMAGE, packages_to_install=[XGBOOST])
def train_model(model_type: str, train: Input[Dataset], test: Input[Dataset], model: Output[Model], metrics: Output[Metrics]):
  """model_type(decision-tree, random-forest, xgboost) 하나를 학습하고 점수를 KFP Metrics로 남긴다."""
  import pickle

  import pandas as pd
  import xgboost as xgb
  from sklearn.ensemble import RandomForestClassifier
  from sklearn.metrics import accuracy_score, roc_auc_score
  from sklearn.tree import DecisionTreeClassifier

  train_df, test_df = pd.read_csv(train.path), pd.read_csv(test.path)
  x_train, y_train = train_df.drop(columns="Target"), train_df.Target
  x_test, y_test = test_df.drop(columns="Target"), test_df.Target
  if model_type == "xgboost":
    params = {"objective": "binary:logistic", "max_depth": 10, "learning_rate": 0.3, "seed": 42}
    trained = xgb.train(params, xgb.DMatrix(x_train, label=y_train), num_boost_round=30)
    p_test = trained.predict(xgb.DMatrix(x_test))
  else:
    estimator = {"decision-tree": DecisionTreeClassifier, "random-forest": RandomForestClassifier}[model_type]
    trained = estimator(random_state=42).fit(x_train, y_train)
    p_test = trained.predict_proba(x_test)[:, 1]
  with open(model.path, "wb") as f:
    pickle.dump(trained, f)
  model.metadata["model_type"] = model_type
  metrics.log_metric("roc_auc_score_test", round(float(roc_auc_score(y_test, p_test)), 6))
  metrics.log_metric("test_accuracy", round(float(accuracy_score(y_test, p_test > 0.5)), 6))


def submit(pipeline_func: Callable, run_name: str, arguments: dict | None = None) -> str:
  """노트북에서 파이프라인을 컴파일해 experiment income-classifier에 run으로 제출하고 run ID를 돌려준다."""
  with open(NAMESPACE_FILE) as f:
    namespace = f.read().strip()
  run = kfp.Client().create_run_from_pipeline_func(
    pipeline_func, arguments=arguments or {}, run_name=run_name, experiment_name=EXPERIMENT, namespace=namespace)
  print(f"submitted {run_name} {run.run_id}")
  return run.run_id


def wait(run_ids: list[str]) -> None:
  """run이 모두 끝날 때까지 기다리고 run마다 최종 상태를 출력한다."""
  client = kfp.Client()
  for run_id in run_ids:
    result = client.wait_for_run_completion(run_id, timeout=1800)
    print(f"{result.display_name} {result.state}")
