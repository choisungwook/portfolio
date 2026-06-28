import logging
import os
import socket
import uuid

import httpx
from fastapi import FastAPI, Request


POD_NAME = os.getenv("POD_NAME", socket.gethostname())
POD_B_URL = os.getenv("POD_B_URL", "http://pod-b:8080/work")
SERVICE_NAME = "pod-a"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(SERVICE_NAME)

app = FastAPI()


def request_id_from(request: Request) -> str:
  return request.headers.get("x-request-id", str(uuid.uuid4()))


def downstream_headers(request: Request, request_id: str) -> dict[str, str]:
  headers = {"x-request-id": request_id}
  cookie = request.headers.get("cookie")
  if cookie:
    headers["cookie"] = cookie
  return headers


@app.get("/call-b")
async def call_b(request: Request) -> dict:
  request_id = request_id_from(request)
  logger.info("received request pod=%s request_id=%s path=/call-b", POD_NAME, request_id)

  headers = downstream_headers(request, request_id)
  async with httpx.AsyncClient(timeout=5.0) as client:
    response = await client.get(POD_B_URL, headers=headers)
    response.raise_for_status()

  downstream = response.json()
  logger.info(
    "called pod-b pod=%s request_id=%s downstream_pod=%s",
    POD_NAME,
    request_id,
    downstream.get("pod", ""),
  )

  return {
    "service": SERVICE_NAME,
    "pod": POD_NAME,
    "request_id": request_id,
    "downstream": downstream,
  }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}
