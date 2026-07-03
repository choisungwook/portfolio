import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse

app = FastAPI(title="SSE FastAPI Hands-on")


def format_sse_event(event_id: int, payload: dict[str, object]) -> str:
  data = json.dumps(payload, ensure_ascii=False)
  return f"id: {event_id}\nevent: tick\ndata: {data}\n\n"


async def stream_tick_events(limit: int, interval: float) -> AsyncIterator[str]:
  for event_id in range(1, limit + 1):
    payload = {
      "event_id": event_id,
      "message": "server event stream is alive",
    }
    yield format_sse_event(event_id, payload)
    await asyncio.sleep(interval)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
  return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
  return """
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <title>SSE FastAPI Hands-on</title>
  </head>
  <body>
    <h1>SSE FastAPI Hands-on</h1>
    <ul id="events"></ul>
    <script>
      const list = document.getElementById("events");
      const source = new EventSource("/events?limit=5&interval=1");
      source.addEventListener("tick", (event) => {
        const item = document.createElement("li");
        item.textContent = event.data;
        list.appendChild(item);
      });
      source.addEventListener("error", () => source.close());
    </script>
  </body>
</html>
"""


@app.get("/events")
async def events(limit: int = 10, interval: float = 1.0) -> StreamingResponse:
  headers = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }
  return StreamingResponse(
    stream_tick_events(limit=limit, interval=interval),
    media_type="text/event-stream",
    headers=headers,
  )
