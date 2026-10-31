"""02-experiments.ipynb의 모델 3개 비교를 Kubeflow Pipelines로 실행한다.

파이프라인 하나를 model_type 파라미터만 바꿔 run 3개로 제출한다. 점수는 KFP Metrics로 남고, KFP 화면의 Compare runs에서 비교한다.
"""
from kfp import dsl

from common import load_data, prepare_data, submit, train_model, wait

MODEL_TYPES = ["decision-tree", "random-forest", "xgboost"]


@dsl.pipeline(name="income-train", description="데이터 준비와 모델 학습. model_type으로 알고리즘을 고른다")
def income_train_pipeline(model_type: str = "xgboost"):
  """load-data, prepare-data, train-model을 순서대로 잇는다. 앞 두 단계는 입력이 같으면 KFP 캐시를 다시 쓴다."""
  data_task = load_data()
  split_task = prepare_data(data=data_task.outputs["data"])
  train_model(model_type=model_type, train=split_task.outputs["train"], test=split_task.outputs["test"])


if __name__ == "__main__":
  wait([submit(income_train_pipeline, f"train-{m}", {"model_type": m}) for m in MODEL_TYPES])
