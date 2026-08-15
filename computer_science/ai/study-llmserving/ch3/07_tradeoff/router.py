"""Cost-optimized routing layer (Figure 3-11, part A).

Keeps a model -> backend mapping so a request is sent to an instance that
already has the model loaded, and falls back to the least loaded instance.
The mapping is refreshed from each backend's /models endpoint, which is why
this design is reactive: it only learns about placement after the fact.
"""

import asyncio
import os
import time
from collections import defaultdict
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

BACKENDS: list[str] = [b for b in os.getenv("BACKENDS", "").split(",") if b]
REFRESH_SECONDS = float(os.getenv("REFRESH_SECONDS", "2"))

app = FastAPI(title="ch03 cost-optimized router")
routing_map: dict[str, list[str]] = defaultdict(list)
inflight: dict[str, int] = defaultdict(int)
metrics = {"sticky_hits": 0, "fallbacks": 0}


class PredictionRequest(BaseModel):
  model_config = ConfigDict(protected_namespaces=())
  model_id: str
  input_data: Any


async def refresh_routing_map():
  async with httpx.AsyncClient(timeout=5) as client:
    while True:
      updated: dict[str, list[str]] = defaultdict(list)
      for backend in BACKENDS:
        try:
          response = await client.get(f"{backend}/models")
          for model_id in response.json().get("loaded_models", {}):
            updated[model_id].append(backend)
        except Exception:
          continue
      routing_map.clear()
      routing_map.update(updated)
      await asyncio.sleep(REFRESH_SECONDS)


def pick_backend(model_id: str) -> str:
  warm = routing_map.get(model_id) or []
  if warm:
    metrics["sticky_hits"] += 1
    return min(warm, key=lambda b: inflight[b])
  if not BACKENDS:
    raise HTTPException(status_code=503, detail="no backends configured")
  metrics["fallbacks"] += 1
  return min(BACKENDS, key=lambda b: inflight[b])


@app.on_event("startup")
async def startup():
  asyncio.create_task(refresh_routing_map())


@app.post("/predict")
async def predict(request: PredictionRequest):
  backend = pick_backend(request.model_id)
  inflight[backend] += 1
  started = time.perf_counter()
  try:
    async with httpx.AsyncClient(timeout=300) as client:
      response = await client.post(f"{backend}/predict", json=request.model_dump())
      response.raise_for_status()
      body = response.json()
  finally:
    inflight[backend] -= 1

  body["_routing"] = {
    "backend": backend,
    "warm": backend in (routing_map.get(request.model_id) or []),
    "router_seconds": round(time.perf_counter() - started, 4),
  }
  return body


@app.get("/routing_map")
async def get_routing_map():
  return {"backends": BACKENDS, "map": routing_map, "inflight": inflight, **metrics}


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "backends": len(BACKENDS)}


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
