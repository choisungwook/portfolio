import threading
import time
from collections import OrderedDict
from typing import Any

from .engine import ModelEngine
from .store import ModelStore
from .worker import ModelWorker


class ModelManager:
  def __init__(self, model_store: ModelStore, max_models: int = 2):
    self.model_store = model_store
    self.max_models = max_models
    self.model_cache: OrderedDict[str, ModelWorker] = OrderedDict()
    self.model_engine = ModelEngine()
    self.lock = threading.Lock()
    self.metrics = {"hits": 0, "misses": 0, "evictions": 0, "load_seconds": 0.0}

  def get_model_worker(self, model_id: str) -> ModelWorker | None:
    with self.lock:
      if model_id in self.model_cache:
        self.model_cache.move_to_end(model_id)
        self.metrics["hits"] += 1
        return self.model_engine.get_worker(model_id)

      model_metadata = self.model_store.get_model(model_id)
      if not model_metadata:
        return None

      self.metrics["misses"] += 1
      if len(self.model_cache) >= self.max_models:
        evicted_id, _ = self.model_cache.popitem(last=False)
        self.model_engine.delete_worker(evicted_id)
        self.metrics["evictions"] += 1

      started = time.perf_counter()
      worker = self.model_engine.create_worker(model_metadata)
      self.metrics["load_seconds"] += time.perf_counter() - started
      self.model_cache[model_id] = worker
      return worker

  def list_loaded_models(self) -> dict[str, str]:
    with self.lock:
      return {mid: w.model_metadata.name for mid, w in self.model_cache.items()}

  def stats(self) -> dict[str, Any]:
    with self.lock:
      total = self.metrics["hits"] + self.metrics["misses"]
      return {
        "max_models": self.max_models,
        "cached": list(self.model_cache.keys()),
        "hit_rate": round(self.metrics["hits"] / total, 3) if total else None,
        **self.metrics,
      }
