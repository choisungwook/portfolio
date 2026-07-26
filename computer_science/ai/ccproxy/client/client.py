"""Anthropic-format client that talks to the proxy instead of api.anthropic.com.

Same thing Claude Code does when ANTHROPIC_BASE_URL points at a proxy.
"""

import json
import os
import sys
import urllib.request

BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "http://localhost:8082")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

# The proxy is on localhost, so ignore any system-wide HTTP proxy settings.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def ask(prompt: str) -> dict:
  """Send one Anthropic Messages request and return the parsed reply."""
  body = {
    "model": MODEL,
    "max_tokens": 128,
    "messages": [{"role": "user", "content": prompt}],
  }
  request = urllib.request.Request(
    f"{BASE_URL}/v1/messages",
    data=json.dumps(body).encode(),
    headers={
      "Content-Type": "application/json",
      "x-api-key": os.environ.get("ANTHROPIC_AUTH_TOKEN", "lab-token"),
      "anthropic-version": "2023-06-01",
    },
  )
  with opener.open(request, timeout=60) as response:
    return json.loads(response.read())


if __name__ == "__main__":
  prompt = " ".join(sys.argv[1:]) or "hello from the lab"
  print(json.dumps(ask(prompt), indent=2, ensure_ascii=False))
