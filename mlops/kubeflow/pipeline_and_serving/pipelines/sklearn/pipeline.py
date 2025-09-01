import kfp
from kfp import dsl
from kfp.dsl import Input, Dataset, Output, Model, Metrics, Artifact


@dsl.component(
  base_image='python:3.12',
  packages_to_install=['numpy', 'scikit-learn==1.5.1', 'joblib', 'pandas']
)
def load_and_preprocess_data(
    x_train_output: Output[Dataset],
    y_train_output: Output[Dataset],
    x_test_output: Output[Dataset],
    y_test_output: Output[Dataset],
    metrics : Output[Metrics]
):
  import numpy as np
  from sklearn.datasets import fetch_openml
  from sklearn.model_selection import train_test_split
  import shutil

  print("[Info] Start loading and preprocessing data")

  # 아티팩트 경로 출력 (KFP가 자동으로 생성)
  print(f"[Info] x_train_output.path: {x_train_output.path}")
  print(f"[Info] y_train_output.path: {y_train_output.path}")
  print(f"[Info] x_test_output.path: {x_test_output.path}")
  print(f"[Info] y_test_output.path: {y_test_output.path}")

  # Load MNIST dataset using sklearn
  mnist = fetch_openml('mnist_784', version=1, parser='auto')
  X, y = mnist.data, mnist.target.astype(int)

  # Split data into train/test (sklearn에서는 직접 분할)
  x_train, x_test, y_train, y_test = train_test_split(
      X, y, test_size=0.2, random_state=42, stratify=y
  )

  # Preprocess data for sklearn (normalize to 0-1, flatten for sklearn)
  x_train = x_train.values / 255.0 if hasattr(x_train, 'values') else x_train / 255.0
  x_test = x_test.values / 255.0 if hasattr(x_test, 'values') else x_test / 255.0

  # Convert to numpy arrays
  x_train = np.array(x_train, dtype=np.float32)
  x_test = np.array(x_test, dtype=np.float32)
  y_train = np.array(y_train)
  y_test = np.array(y_test)

  #logging metrics using Kubeflow Artifacts
  metrics.log_metric("Len x_train", x_train.shape[0])
  metrics.log_metric("Len y_train", y_train.shape[0])
  metrics.log_metric("Len x_test", x_test.shape[0])
  metrics.log_metric("Len y_test", y_test.shape[0])

  # /tmp에 임시 파일로 저장 후 shutil.move를 사용해 아티팩트 경로로 이동
  np.save("/tmp/x_train.npy", x_train)
  shutil.move("/tmp/x_train.npy", x_train_output.path)

  np.save("/tmp/y_train.npy", y_train)
  shutil.move("/tmp/y_train.npy", y_train_output.path)

  np.save("/tmp/x_test.npy", x_test)
  shutil.move("/tmp/x_test.npy", x_test_output.path)

  np.save("/tmp/y_test.npy", y_test)
  shutil.move("/tmp/y_test.npy", y_test_output.path)

  print("[Info] Data preprocessing completed")
  print(f"[Info] x_train shape: {x_train.shape}, y_train shape: {y_train.shape}")
  print(f"[Info] x_test shape: {x_test.shape}, y_test shape: {y_test.shape}")


@dsl.component(
  base_image='python:3.12',
  packages_to_install=['numpy', 'scikit-learn==1.5.1', 'joblib']
)
def train_mnist_model(
  x_train_input: Input[Dataset],
  y_train_input: Input[Dataset],
  trained_model: Output[Model],
  max_depth: int = 10  # hyperparameter
):
  import numpy as np
  from sklearn.ensemble import RandomForestClassifier
  import joblib
  import os
  import time

  print("[Info] Start training")

  x_train = np.load(x_train_input.path)
  y_train = np.load(y_train_input.path)

  # Build sklearn model (RandomForest for MNIST classification)
  model = RandomForestClassifier(
      n_estimators=100,
      random_state=42,
      max_depth=max_depth,
      n_jobs=-1
  )

  print(f"[Info] Model parameters: n_estimators=100, max_depth={max_depth}")

  # Training
  model.fit(x_train, y_train)

  # Create output directory
  os.makedirs(trained_model.path, exist_ok=True)

  # Save the model in pickle format for KServe compatibility
  model_path = os.path.join(trained_model.path, "model.pkl")
  joblib.dump(model, model_path)
  print(f"[Info] Model is saved to {model_path} in pickle format")

  # save metadata
  trained_model.metadata['name'] = 'mnist'
  trained_model.metadata['framework'] = 'sklearn'
  trained_model.metadata['version'] = str(int(time.time()))

  print("[Info] Model training completed")


@dsl.component(
  base_image='python:3.12',
  packages_to_install=['numpy', 'scikit-learn==1.5.1', 'joblib']
)
def evaluate_model(
  model: Input[Model],
  x_test_data: Input[Dataset],
  y_test_data: Input[Dataset],
  metrics: Output[Metrics]
):
  import numpy as np
  from sklearn.metrics import accuracy_score, log_loss
  import joblib
  import os

  print("[Info] Start evaluating model")

  # Load model from pickle format
  model_path = os.path.join(model.path, "model.pkl")
  if not os.path.exists(model_path):
      raise FileNotFoundError(f"Model not found at {model_path}")

  loaded_model = joblib.load(model_path)
  print(f"[Info] Loaded sklearn model from: {model_path}")

  x_test = np.load(x_test_data.path)
  y_test = np.load(y_test_data.path)

  # Predictions
  y_pred = loaded_model.predict(x_test)
  y_pred_proba = loaded_model.predict_proba(x_test)

  # Calculate metrics
  accuracy = accuracy_score(y_test, y_pred)

  # For log loss, we need to handle potential issues with probability predictions
  try:
      loss = log_loss(y_test, y_pred_proba)
  except Exception as e:
      print(f"[Warning] Could not calculate log loss: {e}")
      loss = 0.0

  print(f"[Info] Evaluation results - Loss: {loss}, Accuracy: {accuracy}")

  metrics.log_metric("accuracy", round(accuracy, 4))
  metrics.log_metric("loss", round(loss, 4))
  print("[Info] Model evaluation completed")


@dsl.component(
  base_image='python:3.12',
  packages_to_install=['numpy', 'scikit-learn==1.5.1', 'joblib', 'model_registry']
)
def register_model(
  project: str,
  model: Input[Model],
  metrics: Input[Artifact],
):
  from model_registry import ModelRegistry
  import os
  import json

  registry = ModelRegistry(
    # ref: https://github.com/kubeflow/manifests/tree/master/applications/model-registry/upstream
    # ref: https://github.com/kubeflow/manifests/tree/master/applications/model-registry/upstream/options/istio
    server_address="http://model-registry-service.kubeflow.svc.cluster.local",
    port=8080,
    author="anonymous",
    is_secure=False
  )

  model_name = model.metadata['name']
  model_version = model.metadata['version']
  model_display_name = f"{model_name}-sklearn-classifier"

  print(f"[Info] Registering model '{model_name}' version '{model_version}' to the registry")

  # Verify sklearn model exists
  model_path = os.path.join(model.path, "model.pkl")
  if not os.path.exists(model_path):
      raise FileNotFoundError(f"sklearn model not found at {model_path}")

  print(f"[Info] Found sklearn model at: {model_path}")

  # Get evaluation metrics (if available)
  evaluation_metrics = {}
  try:
      evaluation_metrics = {"model_version": model_version}
  except Exception as e:
      print(f"Could not read evaluation metrics: {e}")

  # Register the model in Kubeflow Model Registry (sklearn format)
  registry.register_model(
    name=model_name,
    uri=model.uri,
    model_format_name="sklearn",
    model_format_version="1.5.1", # sklearn version
    version=model_version,
    description=f"MNIST sklearn classifier model - Version: {model_version}, Metrics: {json.dumps(evaluation_metrics)}",
  )

  print(f"Model registered with display name '{model_display_name}'")
  print(f"Model version: {model_version}")
  print(f"Evaluation metrics: {evaluation_metrics}")


@dsl.pipeline(
  name="mnist-sklearn-pipeline",
  description="A pipeline to train a sklearn model on the MNIST dataset"
)
def mnist_sklearn_pipeline():
  preprocess_task = load_and_preprocess_data()
  train_task = train_mnist_model(
    x_train_input=preprocess_task.outputs['x_train_output'],
    y_train_input=preprocess_task.outputs['y_train_output'],
    max_depth=10
  )
  evaluate_task = evaluate_model(
    model=train_task.outputs['trained_model'],
    x_test_data=preprocess_task.outputs['x_test_output'],
    y_test_data=preprocess_task.outputs['y_test_output']
  )
  register_model(
    project="mnist-sklearn-demo",
    model=train_task.outputs['trained_model'],
    metrics=evaluate_task.outputs['metrics'],
  )

if __name__ == '__main__':
  kfp.compiler.Compiler().compile(
    pipeline_func=mnist_sklearn_pipeline,
    package_path='mnist_sklearn_pipeline.yaml'
  )
  print("[Info] Pipeline compiled successfully and saved to mnist_sklearn_pipeline.yaml")
