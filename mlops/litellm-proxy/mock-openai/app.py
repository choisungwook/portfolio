import os
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException


app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/v1/chat/completions")
def chat_completions(
  payload: dict[str, Any],
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  expected = f"Bearer {os.environ.get('MOCK_API_KEY', 'mock-key')}"
  if authorization != expected:
    raise HTTPException(status_code=401, detail="invalid api key")

  messages = payload.get("messages", [])
  last_content = ""
  if messages:
    last_content = str(messages[-1].get("content", ""))

  return {
    "id": "chatcmpl-local-mock",
    "object": "chat.completion",
    "created": int(time.time()),
    "model": payload.get("model", "local-mock"),
    "choices": [
      {
        "index": 0,
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": f"mock response through LiteLLM: {last_content}",
        },
      }
    ],
    "usage": {
      "prompt_tokens": len(last_content.split()),
      "completion_tokens": 5,
      "total_tokens": len(last_content.split()) + 5,
    },
  }
