"""Latency-optimized routing layer (Figure 3-12, part A).

The map is static and comes from the provisioning step, not from observing
traffic. Every model already has a dedicated, always-on service group, so the
router only has to look the model up and forward.
"""

import json
import os
import time
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

ROUTING_MAP_PATH = os.getenv("ROUTING_MAP_PATH", "07_tradeoff/routing.json")

app = FastAPI(title="ch03 latency-optimized router")

with open(ROUTING_MAP_PATH) as f:
  ROUTING_MAP: dict[str, str] = json.load(f)


class PredictionRequest(BaseModel):
  model_config = ConfigDict(protected_namespaces=())
  model_id: str
  input_data: Any


@app.post("/predict")
async def predict(request: PredictionRequest):
  target = ROUTING_MAP.get(request.model_id)
  if target is None:
    raise HTTPException(status_code=404, detail=f"model {request.model_id} is not provisioned")

  started = time.perf_counter()
  async with httpx.AsyncClient(timeout=300) as client:
    response = await client.post(f"{target}/predict", json=request.model_dump())
    response.raise_for_status()
    body = response.json()

  body["_routing"] = {
    "backend": target,
    "warm": True,
    "router_seconds": round(time.perf_counter() - started, 4),
  }
  return body


@app.get("/routing_map")
async def get_routing_map():
  return {"map": ROUTING_MAP}


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "provisioned_models": len(ROUTING_MAP)}


if __name__ == "__main__":
  uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
