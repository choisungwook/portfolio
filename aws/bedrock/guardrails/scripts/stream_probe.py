# /// script
# requires-python = ">=3.12"
# ///
"""LiteLLM에 stream 요청을 보내고 첫 content 도착 시각, 청크 수, 종료 방식을 출력한다.

usage: uv run scripts/stream_probe.py <guardrail|none> <prompt> [model]
"""

import json
import os
import sys
import time
import urllib.request


def probe(guardrail: str, prompt: str, model: str) -> dict:
    body = {
        "model": model,
        "stream": True,
        "max_tokens": 400,
        "messages": [{"role": "user", "content": prompt}],
        "guardrails": [] if guardrail == "none" else [guardrail],
    }
    req = urllib.request.Request(
        os.environ.get("LITELLM_URL", "http://localhost:4000") + "/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {os.environ['LITELLM_MASTER_KEY']}",
            "Content-Type": "application/json",
        },
    )
    start = time.monotonic()
    first = None
    chunks = 0
    text = ""
    end = "stop"
    try:
        with urllib.request.urlopen(req) as resp:
            for raw in resp:
                line = raw.decode().strip()
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                event = json.loads(line[6:])
                if "error" in event:
                    end = "error: " + str(event["error"].get("message", ""))[:80]
                    break
                choice = event["choices"][0] if event.get("choices") else {}
                delta = (choice.get("delta") or {}).get("content") or ""
                if delta:
                    chunks += 1
                    text += delta
                    first = first or time.monotonic() - start
                if choice.get("finish_reason"):
                    end = choice["finish_reason"]
    except urllib.error.HTTPError as e:
        end = f"HTTP {e.code}"
    return {
        "guardrail": guardrail,
        "first_content_s": round(first, 3) if first else None,
        "total_s": round(time.monotonic() - start, 3),
        "content_chunks": chunks,
        "chars": len(text),
        "end": end,
        "tail": text[-60:],
    }


if __name__ == "__main__":
    model = sys.argv[3] if len(sys.argv) > 3 else "nova-micro"
    print(json.dumps(probe(sys.argv[1], sys.argv[2], model), ensure_ascii=False))
