"""Preprocess an image for densenet_onnx and call it through our multi-model API."""

import argparse

import numpy as np
import requests
from PIL import Image

TRITON_MODEL_ID = "8ba7b810-9dad-11d1-80b4-00c04fd430c9"
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def preprocess(path: str) -> np.ndarray:
  image = Image.open(path).convert("RGB").resize((224, 224))
  array = np.asarray(image, dtype=np.float32).transpose(2, 0, 1) / 255.0
  return (array - MEAN) / STD


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--url", default="http://localhost:8001")
  parser.add_argument("--image", default="06_multimodel/samples/cat.jpg")
  parser.add_argument(
    "--labels", default="06_multimodel/model_dir/densenet_onnx/densenet_labels.txt"
  )
  args = parser.parse_args()

  tensor = preprocess(args.image)
  payload = {
    "model_id": TRITON_MODEL_ID,
    "input_data": {"data_0": {"shape": list(tensor.shape), "data": tensor.reshape(-1).tolist()}},
  }
  response = requests.post(f"{args.url}/predict", json=payload, timeout=300)
  response.raise_for_status()
  result = response.json()

  try:
    with open(args.labels) as f:
      labels = [line.strip() for line in f]
  except FileNotFoundError:
    labels = None

  results = zip(result["top5_index"], result["top5_score"], strict=True)
  for rank, (idx, score) in enumerate(results, start=1):
    name = labels[idx] if labels and idx < len(labels) else str(idx)
    print(f"{rank}. {name}  ({score:.3f})")
  print(result["_timing"])


if __name__ == "__main__":
  main()
