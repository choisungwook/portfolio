import asyncio
import json
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from itertools import count

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse

app = FastAPI(title="SSE FastAPI Hands-on")


def service_name() -> str:
  """Return the service name included in each SSE payload."""
  return os.getenv("SSE_SERVICE_NAME", "sse-fastapi")


def interval_seconds() -> float:
  """Return the delay between SSE messages."""
  value = os.getenv("SSE_INTERVAL_SECONDS", "1")
  return float(value)


def event_payload(event_id: int) -> dict[str, object]:
  """Build one event payload."""
  return {
    "id": event_id,
    "service": service_name(),
    "message": f"server event {event_id}",
    "sent_at": datetime.now(UTC).isoformat(),
  }


def encode_sse(event_id: int, payload: dict[str, object]) -> str:
  """Encode a payload with the SSE wire format."""
  data = json.dumps(payload, ensure_ascii=True)
  return f"id: {event_id}\nevent: tick\ndata: {data}\n\n"


async def event_stream() -> AsyncIterator[str]:
  """Yield SSE messages until the client disconnects."""
  for event_id in count(1):
    yield encode_sse(event_id, event_payload(event_id))
    await asyncio.sleep(interval_seconds())


@app.get("/health")
async def health() -> dict[str, str]:
  """Return a simple health check response."""
  return {"status": "ok"}


@app.get("/")
async def index() -> HTMLResponse:
  """Return a browser client for EventSource."""
  html = """
  <!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8">
      <title>SSE FastAPI Hands-on</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 2rem; }
        pre { background: #111827; color: #f9fafb; padding: 1rem; min-height: 12rem; }
      </style>
    </head>
    <body>
      <h1>SSE FastAPI Hands-on</h1>
      <p>서버가 보내는 tick 이벤트를 EventSource로 수신합니다.</p>
      <pre id="events"></pre>
      <script>
        const output = document.querySelector("#events");
        const source = new EventSource("/events");

        source.addEventListener("tick", (event) => {
          output.textContent += `${event.lastEventId} ${event.data}\\n`;
        });
      </script>
    </body>
  </html>
  """
  return HTMLResponse(html)


@app.get("/events")
async def events() -> StreamingResponse:
  """Stream tick events with the text/event-stream content type."""
  headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }
  return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)
