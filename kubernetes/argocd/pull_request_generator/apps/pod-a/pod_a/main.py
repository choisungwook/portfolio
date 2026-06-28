import logging
import os
import socket
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request


POD_NAME = os.getenv("POD_NAME", socket.gethostname())
POD_NAMESPACE = os.getenv("POD_NAMESPACE", "unknown")
DESTINATION_URL = os.getenv(
  "DESTINATION_URL",
  os.getenv("POD_B_URL", "http://baseline-service.baseline.svc.cluster.local:8080/work"),
)
SERVICE_NAME = os.getenv("SERVICE_NAME", "pod-a")
SERVICE_FQDN = os.getenv("SERVICE_FQDN", f"{SERVICE_NAME}.{POD_NAMESPACE}.svc.cluster.local")
LOGGED_HEADERS = ("host", "cookie", "x-request-id")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(SERVICE_NAME)

app = FastAPI()


def request_id_from() -> str:
  return str(uuid.uuid4())


def logged_headers_from(request: Request) -> dict[str, str]:
  return {name: request.headers[name] for name in LOGGED_HEADERS if name in request.headers}


def destination_host_from(url: str) -> str:
  return urlparse(url).netloc


@app.get("/call-b")
async def call_b(request: Request) -> dict:
  request_id = request_id_from()
  incoming_headers = logged_headers_from(request)
  destination_host = destination_host_from(DESTINATION_URL)
  logger.info(
    "received request service=%s service_fqdn=%s pod=%s namespace=%s request_id=%s path=/call-b headers=%s destination_url=%s destination_host=%s",
    SERVICE_NAME,
    SERVICE_FQDN,
    POD_NAME,
    POD_NAMESPACE,
    request_id,
    incoming_headers,
    DESTINATION_URL,
    destination_host,
  )

  async with httpx.AsyncClient(timeout=5.0) as client:
    response = await client.get(DESTINATION_URL)
    response.raise_for_status()

  downstream = response.json()
  logger.info(
    "called destination service=%s service_fqdn=%s pod=%s namespace=%s request_id=%s destination_url=%s destination_host=%s downstream_service=%s downstream_namespace=%s downstream_service_fqdn=%s",
    SERVICE_NAME,
    SERVICE_FQDN,
    POD_NAME,
    POD_NAMESPACE,
    request_id,
    DESTINATION_URL,
    destination_host,
    downstream.get("service", ""),
    downstream.get("namespace", ""),
    downstream.get("service_fqdn", ""),
  )

  return {
    "service": SERVICE_NAME,
    "service_fqdn": SERVICE_FQDN,
    "pod": POD_NAME,
    "namespace": POD_NAMESPACE,
    "request_id": request_id,
    "destination": {
      "url": DESTINATION_URL,
      "host": destination_host,
    },
    "downstream": downstream,
  }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}
