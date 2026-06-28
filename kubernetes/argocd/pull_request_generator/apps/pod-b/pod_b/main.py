import logging
import os
import socket
import uuid

from fastapi import FastAPI, Request


POD_NAME = os.getenv("POD_NAME", socket.gethostname())
POD_NAMESPACE = os.getenv("POD_NAMESPACE", "unknown")
SERVICE_NAME = os.getenv("SERVICE_NAME", "pod-b")
SERVICE_FQDN = os.getenv("SERVICE_FQDN", f"{SERVICE_NAME}.{POD_NAMESPACE}.svc.cluster.local")
LOGGED_HEADERS = ("host", "cookie", "x-request-id")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(SERVICE_NAME)

app = FastAPI()


def request_id_from() -> str:
  return str(uuid.uuid4())


def logged_headers_from(request: Request) -> dict[str, str]:
  return {name: request.headers[name] for name in LOGGED_HEADERS if name in request.headers}


@app.get("/work")
async def work(request: Request) -> dict:
  request_id = request_id_from()
  headers = logged_headers_from(request)
  logger.info(
    "received request service=%s service_fqdn=%s pod=%s namespace=%s request_id=%s path=/work headers=%s",
    SERVICE_NAME,
    SERVICE_FQDN,
    POD_NAME,
    POD_NAMESPACE,
    request_id,
    headers,
  )

  return {
    "service": SERVICE_NAME,
    "service_fqdn": SERVICE_FQDN,
    "pod": POD_NAME,
    "namespace": POD_NAMESPACE,
    "request_id": request_id,
    "message": "pod-b handled the request",
  }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}
