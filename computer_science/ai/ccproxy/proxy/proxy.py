"""Minimal Anthropic-to-OpenAI translating proxy.

Serves POST /v1/messages (Anthropic Messages API), rewrites the body into the
OpenAI Chat Completions format, forwards it upstream, and translates the answer
back. Standard library only so the wire format stays visible.
"""

import json
import os
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

UPSTREAM_URL = os.environ.get("UPSTREAM_URL", "http://upstream:9000/v1/chat/completions")
UPSTREAM_KEY = os.environ.get("UPSTREAM_KEY", "")
SMALL_MODEL = os.environ.get("SMALL_MODEL", "mock-small")
BIG_MODEL = os.environ.get("BIG_MODEL", "mock-big")
PORT = int(os.environ.get("PORT", "8082"))


def pick_model(anthropic_model: str) -> str:
  """Route a Claude model name to an upstream model name."""
  return SMALL_MODEL if "haiku" in anthropic_model else BIG_MODEL


def flatten_content(content) -> str:
  """Turn Anthropic content (string or block list) into plain text."""
  if isinstance(content, str):
    return content
  return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def to_openai(body: dict) -> dict:
  """Translate an Anthropic Messages request into a Chat Completions request."""
  messages = []
  if body.get("system"):
    messages.append({"role": "system", "content": flatten_content(body["system"])})
  for message in body.get("messages", []):
    messages.append({"role": message["role"], "content": flatten_content(message["content"])})

  return {
    "model": pick_model(body.get("model", "")),
    "messages": messages,
    "max_tokens": body.get("max_tokens", 1024),
    "temperature": body.get("temperature", 1.0),
  }


STOP_REASONS = {"stop": "end_turn", "length": "max_tokens"}


def to_anthropic(response: dict, requested_model: str) -> dict:
  """Translate a Chat Completions response back into an Anthropic message."""
  choice = response["choices"][0]
  usage = response.get("usage", {})

  return {
    "id": response.get("id", "msg_proxy"),
    "type": "message",
    "role": "assistant",
    "model": requested_model,
    "content": [{"type": "text", "text": choice["message"]["content"]}],
    "stop_reason": STOP_REASONS.get(choice.get("finish_reason"), "end_turn"),
    "usage": {
      "input_tokens": usage.get("prompt_tokens", 0),
      "output_tokens": usage.get("completion_tokens", 0),
    },
  }


def call_upstream(payload: dict) -> dict:
  """POST the translated payload to the upstream OpenAI-compatible endpoint."""
  request = urllib.request.Request(
    UPSTREAM_URL,
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {UPSTREAM_KEY}"},
  )
  with urllib.request.urlopen(request, timeout=60) as response:
    return json.loads(response.read())


class Handler(BaseHTTPRequestHandler):
  def do_POST(self) -> None:
    if self.path != "/v1/messages":
      self.reply(404, {"error": "only POST /v1/messages is implemented"})
      return

    body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
    if body.get("stream"):
      # ponytail: streaming needs SSE re-framing; add it when a real client is plugged in.
      self.reply(400, {"error": "stream=true is not supported by this lab proxy"})
      return

    payload = to_openai(body)
    print(f"[proxy] {body.get('model')} -> {payload['model']}", flush=True)
    try:
      answer = to_anthropic(call_upstream(payload), body.get("model", ""))
    except Exception as error:
      self.reply(502, {"error": f"upstream failed: {error}"})
      return
    self.reply(200, answer)

  def reply(self, status: int, body: dict) -> None:
    data = json.dumps(body).encode()
    self.send_response(status)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


def selftest() -> None:
  """Check both translation directions without a network call."""
  request = {
    "model": "claude-haiku-4-5",
    "system": "be short",
    "max_tokens": 64,
    "messages": [{"role": "user", "content": [{"type": "text", "text": "hello"}]}],
  }
  translated = to_openai(request)
  assert translated["model"] == SMALL_MODEL
  assert translated["messages"] == [
    {"role": "system", "content": "be short"},
    {"role": "user", "content": "hello"},
  ]

  upstream = {
    "id": "chatcmpl-1",
    "choices": [{"message": {"content": "hi"}, "finish_reason": "length"}],
    "usage": {"prompt_tokens": 3, "completion_tokens": 1},
  }
  message = to_anthropic(upstream, "claude-haiku-4-5")
  assert message["content"] == [{"type": "text", "text": "hi"}]
  assert message["stop_reason"] == "max_tokens"
  assert message["usage"] == {"input_tokens": 3, "output_tokens": 1}
  print("selftest ok")


if __name__ == "__main__":
  if "--selftest" in sys.argv:
    selftest()
  else:
    print(f"[proxy] listening on :{PORT}, upstream {UPSTREAM_URL}", flush=True)
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
