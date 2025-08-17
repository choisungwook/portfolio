import kfp
from kfp import dsl
from kfp.dsl import Input, Dataset, Output, Model, Metrics


@dsl.component(
  # use below image when you use amd64
  # base_image='tensorflow/tensorflow:2.19.0',
  # if you use arm64, use below image
  base_image='choisunguk/tensorflow:2.19.0',
  packages_to_install=['numpy']
)
def load_and_preprocess_data(
    x_train_output: Output[Dataset],
    y_train_output: Output[Dataset],
    x_test_output: Output[Dataset],
    y_test_output: Output[Dataset],
    metrics : Output[Metrics]
):
  import numpy as np
  import tensorflow as tf
  import shutil

  print("[Info] Start loading and preprocessing data")
  print(f"[Info] TensorFlow version: {tf.__version__}")

  # 아티팩트 경로 출력 (KFP가 자동으로 생성)
  print(f"[Info] x_train_output.path: {x_train_output.path}")
  print(f"[Info] y_train_output.path: {y_train_output.path}")
  print(f"[Info] x_test_output.path: {x_test_output.path}")
  print(f"[Info] y_test_output.path: {y_test_output.path}")

  (x_train, y_train), (x_test, y_test) = tf.keras.datasets.mnist.load_data()

  # preprocess Datasets
  x_train = x_train.reshape(-1,28,28,1)
  x_test = x_test.reshape(-1,28,28,1)
  x_train = x_train / 255
  x_test = x_test / 255

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
  # use below image when you use amd64
  # base_image='tensorflow/tensorflow:2.19.0',
  # if you use arm64, use below image
  base_image='choisunguk/tensorflow:2.19.0',
  packages_to_install=['numpy']
)
def train_mnist_model(
  x_train_input: Input[Dataset],
  y_train_input: Input[Dataset],
  trained_model: Output[Model],
  epochs: int = 1 # hyperparameter
):
  import numpy as np
  from tensorflow import keras
  import os

  print("[Info] Start training")

  x_train = np.load(x_train_input.path)
  y_train = np.load(y_train_input.path)

  # build a model
  model = keras.models.Sequential([
    keras.layers.Conv2D(64, (3, 3), activation='relu', input_shape=(28, 28, 1)),
    keras.layers.MaxPool2D(2, 2),
    keras.layers.Conv2D(64, (3, 3), activation='relu'),
    keras.layers.MaxPool2D(2, 2),
    keras.layers.Flatten(),
    keras.layers.Dense(64, activation='relu'),
    keras.layers.Dense(10, activation='softmax')
  ])

  model.compile(optimizer="adam",
                loss="sparse_categorical_crossentropy",
                metrics=['accuracy'])

  model.summary()

  # training
  model.fit(x=x_train, y=y_train, epochs=epochs)

  # save the model
  save_model_path = os.path.join(trained_model.path, "model.keras")
  os.makedirs(trained_model.path, exist_ok=True)
  model.save(save_model_path, save_format='keras_v3')
  print(f"[Info] Model is saved to {save_model_path}")

  # save metadata
  trained_model.metadata['framework'] = 'tensorflow'

  print("[Info] Model training completed")


@dsl.component(
  # use below image when you use amd64
  # base_image='tensorflow/tensorflow:2.19.0',
  # if you use arm64, use below image
  base_image='choisunguk/tensorflow:2.19.0',
  packages_to_install=['numpy']
)
def evaluate_model(
  model: Input[Model],
  x_test_data: Input[Dataset],
  y_test_data: Input[Dataset],
  metrics: Output[Metrics]
):
  import numpy as np
  import tensorflow as tf
  import os

  print("[Info] Start evaluating model")
  keras_model_path = os.path.join(model.path, "model.keras")
  model = tf.keras.models.load_model(keras_model_path)

  x_test = np.load(x_test_data.path)
  y_test = np.load(y_test_data.path)

  loss, accuracy = model.evaluate(x_test, y_test)

  print(f"[Info] Evaluation results - Loss: {loss}, Accuracy: {accuracy}")

  metrics.log_metric("accuracy", round(accuracy, 4))
  metrics.log_metric("loss", round(loss, 4))
  print("[Info] Model evaluation completed")


@dsl.pipeline(
  name="mnist-pipeline",
  description="A pipeline to train a model on the MNIST dataset"
)
def mnist_pipeline():
  preprocess_task = load_and_preprocess_data()
  train_task = train_mnist_model(
    x_train_input=preprocess_task.outputs['x_train_output'],
    y_train_input=preprocess_task.outputs['y_train_output'],
    epochs=1
  )
  evaluate_task = evaluate_model(
    model=train_task.outputs['trained_model'],
    x_test_data=preprocess_task.outputs['x_test_output'],
    y_test_data=preprocess_task.outputs['y_test_output']
  )

if __name__ == '__main__':
  kfp.compiler.Compiler().compile(
    pipeline_func=mnist_pipeline,
    package_path='mnist_pipeline.yaml'
  )
  print("[Info] Pipeline compiled successfully and saved to mnist_pipeline.yaml")
