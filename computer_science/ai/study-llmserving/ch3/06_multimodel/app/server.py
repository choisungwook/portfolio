import os
import time
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from .manager import ModelManager
from .store import ModelStore

DEFAULT_CONFIG = os.path.join(
  os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config", "models.json"
)
CONFIG_PATH = os.getenv("MODELS_CONFIG", DEFAULT_CONFIG)
MAX_MODELS = int(os.getenv("MAX_MODELS", "2"))
PRELOAD_MODEL_ID = os.getenv("PRELOAD_MODEL_ID", "")

app = FastAPI(title="ch03 multi-model serving")
model_store = ModelStore(CONFIG_PATH)
model_manager = ModelManager(model_store, max_models=MAX_MODELS)


@app.on_event("startup")
async def preload():
  if PRELOAD_MODEL_ID:
    model_manager.get_model_worker(PRELOAD_MODEL_ID)


class PredictionRequest(BaseModel):
  model_config = ConfigDict(protected_namespaces=())
  model_id: str
  input_data: Any


@app.post("/predict")
async def predict(request: PredictionRequest):
  started = time.perf_counter()
  worker = model_manager.get_model_worker(request.model_id)
  if not worker:
    raise HTTPException(status_code=404, detail=f"Model {request.model_id} not found")
  acquire_seconds = time.perf_counter() - started

  try:
    result = worker.predict(request.input_data)
  except Exception as exc:
    raise HTTPException(status_code=500, detail=str(exc)) from exc

  return {
    **result,
    "_timing": {
      "acquire_worker_seconds": round(acquire_seconds, 4),
      "total_seconds": round(time.perf_counter() - started, 4),
    },
  }


@app.get("/models")
async def list_models():
  return {
    "available_models": model_store.list_models(),
    "loaded_models": model_manager.list_loaded_models(),
  }


@app.get("/stats")
async def stats():
  return model_manager.stats()


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "max_models": MAX_MODELS}


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
