"""Fake OpenAI-compatible backend so the lab runs without any API key.

Serves POST /v1/chat/completions and echoes the last user message back in the
Chat Completions response shape.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("PORT", "9000"))


def build_response(payload: dict) -> dict:
  """Build a canned Chat Completions response for the incoming payload."""
  last_user = next(
    (m["content"] for m in reversed(payload.get("messages", [])) if m["role"] == "user"), ""
  )
  text = f"[{payload.get('model')}] you said: {last_user}"

  return {
    "id": "chatcmpl-mock",
    "object": "chat.completion",
    "model": payload.get("model"),
    "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": len(last_user.split()), "completion_tokens": len(text.split())},
  }


class Handler(BaseHTTPRequestHandler):
  def do_POST(self) -> None:
    payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
    print(f"[upstream] received model={payload.get('model')}", flush=True)
    data = json.dumps(build_response(payload)).encode()
    self.send_response(200)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


if __name__ == "__main__":
  print(f"[upstream] listening on :{PORT}", flush=True)
  HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
