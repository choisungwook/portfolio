import os
import time
import uuid

import httpx
from fastapi import FastAPI, Request


SERVICE_NAME = os.getenv("SERVICE_NAME", "service-a")
SERVICE_VERSION = os.getenv("SERVICE_VERSION", "main")
SERVICE_B_URL = os.getenv("SERVICE_B_URL", "http://service-b-main:8080/process")
ZIPKIN_URL = os.getenv("ZIPKIN_URL", "http://zipkin:9411/api/v2/spans")
PROPAGATED_HEADERS = ["x-request-id", "x-pr-preview"]

app = FastAPI()


def new_span_id() -> str:
  return uuid.uuid4().hex[:16]


def trace_id_from(traceparent: str | None) -> str:
  if not traceparent:
    return uuid.uuid4().hex

  parts = traceparent.split("-")
  if len(parts) == 4 and len(parts[1]) == 32:
    return parts[1]

  return uuid.uuid4().hex


def parent_span_id_from(traceparent: str | None) -> str | None:
  if not traceparent:
    return None

  parts = traceparent.split("-")
  if len(parts) == 4 and len(parts[2]) == 16:
    return parts[2]

  return None


def build_headers(request: Request, trace_id: str, span_id: str) -> dict[str, str]:
  headers = {}
  for name in PROPAGATED_HEADERS:
    value = request.headers.get(name)
    if value:
      headers[name] = value

  headers.setdefault("x-request-id", str(uuid.uuid4()))
  headers.setdefault("x-pr-preview", SERVICE_VERSION)
  headers["traceparent"] = f"00-{trace_id}-{span_id}-01"
  return headers


async def send_zipkin_span(
  trace_id: str,
  span_id: str,
  parent_span_id: str | None,
  start_time: float,
  duration_ms: float,
) -> None:
  span = {
    "traceId": trace_id,
    "id": span_id,
    "name": f"{SERVICE_NAME} /start",
    "timestamp": int(start_time * 1_000_000),
    "duration": max(1, int(duration_ms * 1_000)),
    "localEndpoint": {
      "serviceName": f"{SERVICE_NAME}-{SERVICE_VERSION}",
      "port": 8080,
    },
    "tags": {
      "preview.version": SERVICE_VERSION,
    },
  }
  if parent_span_id:
    span["parentId"] = parent_span_id

  try:
    async with httpx.AsyncClient(timeout=1.0) as client:
      await client.post(ZIPKIN_URL, json=[span])
  except httpx.HTTPError:
    pass


@app.get("/start")
async def start(request: Request) -> dict:
  started_at = time.time()
  traceparent = request.headers.get("traceparent")
  trace_id = trace_id_from(traceparent)
  parent_span_id = parent_span_id_from(traceparent)
  span_id = new_span_id()
  headers = build_headers(request, trace_id, span_id)

  async with httpx.AsyncClient(timeout=5.0) as client:
    response = await client.get(SERVICE_B_URL, headers=headers)
    response.raise_for_status()
    downstream = response.json()

  duration_ms = (time.time() - started_at) * 1000
  await send_zipkin_span(trace_id, span_id, parent_span_id, started_at, duration_ms)

  return {
    "service": SERVICE_NAME,
    "version": SERVICE_VERSION,
    "received_headers": {
      "x-request-id": headers["x-request-id"],
      "x-pr-preview": headers["x-pr-preview"],
      "traceparent": request.headers.get("traceparent", "generated"),
    },
    "forwarded_headers": headers,
    "downstream": downstream,
  }


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}
