from .store import ModelMetadata
from .worker import ModelWorker, TorchVisionWorker, TransformerWorker, TritonWorker

WORKER_TYPES = {
  "transformers": TransformerWorker,
  "torchvision": TorchVisionWorker,
  "triton": TritonWorker,
}


class ModelEngine:
  def __init__(self):
    self.workers: dict[str, ModelWorker] = {}

  def get_worker(self, model_id: str) -> ModelWorker | None:
    return self.workers.get(model_id)

  def create_worker(self, model_metadata: ModelMetadata) -> ModelWorker:
    if model_metadata.id not in self.workers:
      worker_type = WORKER_TYPES.get(model_metadata.framework)
      if worker_type is None:
        raise ValueError(f"unsupported framework: {model_metadata.framework}")
      self.workers[model_metadata.id] = worker_type(model_metadata)
    return self.workers[model_metadata.id]

  def delete_worker(self, model_id: str):
    worker = self.workers.pop(model_id, None)
    if worker is not None and hasattr(worker, "unload"):
      worker.unload()
