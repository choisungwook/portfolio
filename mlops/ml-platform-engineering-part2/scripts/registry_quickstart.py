# /// script
# requires-python = ">=3.12"
# dependencies = ["mlflow==3.17.2", "scikit-learn==1.8.0"]
# ///
"""모델 레지스트리를 도커 레지스트리처럼 써 본다. push는 모델을 등록하고, pull은 이름과 alias로 꺼내 예측한다.

맥북에서 MLflow를 port-forward한 상태로 실행한다. 모델 파일은 MLflow 서버가 object storage로 중계하므로 S3 계정이 필요 없다.
  uv run scripts/registry_quickstart.py push
  uv run scripts/registry_quickstart.py pull
"""
import os
import sys

import mlflow
from mlflow import MlflowClient
from sklearn.datasets import load_breast_cancer
from sklearn.linear_model import LogisticRegression

MODEL_NAME = "quickstart-model"
ALIAS = "champion"
mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "http://localhost:5000"))
# 서버가 내려주는 분할 다운로드 주소는 클러스터 안 object storage 주소라 맥북에서 닿지 않는다. 서버 중계로만 받는다.
os.environ.setdefault("MLFLOW_ENABLE_PROXY_MULTIPART_DOWNLOAD", "false")


def push() -> None:
  """작은 분류 모델을 학습해 run으로 기록하고, 레지스트리에 새 버전으로 등록한 뒤 alias를 그 버전으로 옮긴다."""
  x, y = load_breast_cancer(return_X_y=True, as_frame=True)
  model = LogisticRegression(max_iter=5000).fit(x, y)
  mlflow.set_experiment("registry-quickstart")
  with mlflow.start_run(run_name="push"):
    info = mlflow.sklearn.log_model(model, name="model", input_example=x.head(3),
                                    registered_model_name=MODEL_NAME)
  version = info.registered_model_version
  MlflowClient().set_registered_model_alias(MODEL_NAME, ALIAS, version)
  print(f"pushed {MODEL_NAME} v{version} @{ALIAS}")


def pull() -> None:
  """이름과 alias만으로 모델을 내려받아 예측한다. 어느 run이 만든 모델인지 몰라도 된다."""
  uri = f"models:/{MODEL_NAME}@{ALIAS}"
  model = mlflow.pyfunc.load_model(uri)
  x, _ = load_breast_cancer(return_X_y=True, as_frame=True)
  version = MlflowClient().get_model_version_by_alias(MODEL_NAME, ALIAS).version
  print(f"pulled {uri} (v{version}) predict={model.predict(x.head(3)).tolist()}")


if __name__ == "__main__":
  {"push": push, "pull": pull}[sys.argv[1]]()
