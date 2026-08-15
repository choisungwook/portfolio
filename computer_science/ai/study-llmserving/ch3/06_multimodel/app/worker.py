import os
import time
from abc import ABC, abstractmethod
from typing import Any

import numpy as np
import requests
import torch
import torchvision.transforms as transforms
from PIL import Image
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2
from transformers import AutoModelForSequenceClassification, AutoTokenizer

TRITON_URL = os.getenv("TRITON_URL", "localhost:8009")


class ModelWorker(ABC):
  def __init__(self, model_metadata):
    self.model_metadata = model_metadata
    self.model: torch.nn.Module | None = None
    started = time.perf_counter()
    self._load_model()
    self.load_seconds = time.perf_counter() - started

  @abstractmethod
  def _load_model(self): ...

  @abstractmethod
  def predict(self, input_data: Any) -> dict[str, Any]: ...


class TransformerWorker(ModelWorker):
  def __init__(self, model_metadata):
    self.tokenizer: AutoTokenizer | None = None
    super().__init__(model_metadata)

  def _load_model(self):
    if self.model is None:
      self.model = AutoModelForSequenceClassification.from_pretrained(self.model_metadata.name)
      self.tokenizer = AutoTokenizer.from_pretrained(self.model_metadata.name)
      self.model.eval()

  def predict(self, input_data: Any) -> dict[str, Any]:
    inputs = self.tokenizer(input_data, return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
      outputs = self.model(**inputs)
    predictions = torch.softmax(outputs.logits, dim=-1)
    return {"predictions": predictions.tolist()}


class TorchVisionWorker(ModelWorker):
  def __init__(self, model_metadata):
    self.transform: transforms.Compose | None = None
    super().__init__(model_metadata)

  def _load_model(self):
    if self.model is None:
      self.model = mobilenet_v2(weights=MobileNet_V2_Weights.DEFAULT)
      self.model.eval()
      self.transform = transforms.Compose(
        [
          transforms.Resize(256),
          transforms.CenterCrop(224),
          transforms.ToTensor(),
          transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
      )

  def predict(self, input_data: Any) -> dict[str, Any]:
    image = Image.open(input_data).convert("RGB") if isinstance(input_data, str) else input_data
    image_tensor = self.transform(image).unsqueeze(0)
    with torch.no_grad():
      outputs = self.model(image_tensor)
    predictions = torch.softmax(outputs, dim=1)
    top = torch.topk(predictions, k=5)
    return {"top5_index": top.indices.tolist(), "top5_prob": top.values.tolist()}


class TritonWorker(ModelWorker):
  def __init__(self, model_metadata):
    import tritonclient.http as httpclient

    self.httpclient = httpclient
    self.triton_url = TRITON_URL
    self.client = httpclient.InferenceServerClient(url=self.triton_url)
    super().__init__(model_metadata)

  def _load_model(self):
    load_url = f"http://{self.triton_url}/v2/repository/models/{self.model_metadata.name}/load"
    response = requests.post(load_url, timeout=120)
    if response.status_code != 200:
      raise RuntimeError(f"failed to load model on triton: {response.text}")
    if not self.client.is_model_ready(self.model_metadata.name):
      raise RuntimeError("model is not ready after loading")

  def predict(self, input_data: dict[str, Any]) -> dict[str, Any]:
    inputs = []
    for name, data in input_data.items():
      if isinstance(data, np.ndarray):
        array = data.astype(np.float32)
      else:
        array = np.array(data["data"], dtype=np.float32).reshape(data["shape"])
      tensor = self.httpclient.InferInput(name, array.shape, "FP32")
      tensor.set_data_from_numpy(array)
      inputs.append(tensor)

    output_name = "fc6_1"
    response = self.client.infer(
      model_name=self.model_metadata.name,
      inputs=inputs,
      outputs=[self.httpclient.InferRequestedOutput(output_name)],
    )
    scores = response.as_numpy(output_name).reshape(-1)
    top5 = np.argsort(scores)[-5:][::-1]
    return {"top5_index": top5.tolist(), "top5_score": scores[top5].tolist()}

  def unload(self):
    unload_url = f"http://{self.triton_url}/v2/repository/models/{self.model_metadata.name}/unload"
    try:
      requests.post(unload_url, timeout=60)
    except Exception:
      pass

  def __del__(self):
    self.unload()
