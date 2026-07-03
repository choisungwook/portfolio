import asyncio
import json
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse


def read_positive_int(name: str, default: int) -> int:
  """Read a positive integer from an environment variable."""
  value = os.getenv(name)
  if value is None:
    return default

  parsed_value = int(value)
  if parsed_value < 1:
    raise ValueError(f"{name} must be greater than 0")

  return parsed_value


EVENT_INTERVAL_SECONDS = read_positive_int("EVENT_INTERVAL_SECONDS", 1)
APP_PORT = read_positive_int("APP_PORT", 8000)

app = FastAPI(title="FastAPI SSE handson")


def build_event(event_id: int) -> str:
  """Build one SSE frame."""
  payload = {
    "event_id": event_id,
    "message": f"server event {event_id}",
    "created_at": datetime.now(UTC).isoformat(),
  }
  data = json.dumps(payload, separators=(",", ":"))
  return f"event: heartbeat\nid: {event_id}\ndata: {data}\n\n"


async def event_stream() -> AsyncIterator[str]:
  """Yield SSE frames at a fixed interval."""
  event_id = 1
  while True:
    yield build_event(event_id)
    event_id += 1
    await asyncio.sleep(EVENT_INTERVAL_SECONDS)


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
  """Render a small EventSource client."""
  return """
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FastAPI SSE handson</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 40px;
        max-width: 760px;
      }
      pre {
        background: #111827;
        color: #f9fafb;
        min-height: 280px;
        padding: 16px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <h1>FastAPI SSE handson</h1>
    <p>/events 연결에서 서버 이벤트가 순서대로 도착합니다.</p>
    <pre id="events"></pre>
    <script>
      const events = document.querySelector("#events");
      const source = new EventSource("/events");

      source.addEventListener("heartbeat", (event) => {
        events.textContent += `${event.lastEventId} ${event.data}\\n`;
      });

      source.onerror = () => {
        events.textContent += "connection closed or retrying\\n";
      };
    </script>
  </body>
</html>
"""


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  """Return a simple health check response."""
  return {"status": "ok"}


@app.get("/events")
async def events() -> StreamingResponse:
  """Stream SSE frames to the client."""
  headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }
  return StreamingResponse(
    event_stream(),
    media_type="text/event-stream",
    headers=headers,
  )


def run() -> None:
  """Run the development server."""
  uvicorn.run("sse_fastapi.app:app", host="0.0.0.0", port=APP_PORT)
