import logging
import os
import socket
import uuid

from fastapi import FastAPI, Request


POD_NAME = os.getenv("POD_NAME", socket.gethostname())
POD_NAMESPACE = os.getenv("POD_NAMESPACE", "unknown")
SERVICE_NAME = "pod-b"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(SERVICE_NAME)

app = FastAPI()


def request_id_from(request: Request) -> str:
  return request.headers.get("x-request-id", str(uuid.uuid4()))


@app.get("/work")
async def work(request: Request) -> dict[str, str]:
  request_id = request_id_from(request)
  host = request.headers.get("host", "")
  logger.info("received request pod=%s request_id=%s host=%s path=/work", POD_NAME, request_id, host)

  return {
    "service": SERVICE_NAME,
    "pod": POD_NAME,
    "namespace": POD_NAMESPACE,
    "request_id": request_id,
    "host": host,
    "message": "pod-b handled the request",
  }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}
