"""스트리밍 응답의 청크마다 도착 시각과 내용을 출력한다.

사용법: uv run python scripts/stream_timing.py <model> "<질문>" [--web-search]
"""

import sys
import time

from openai import OpenAI


def main(model: str, question: str, web_search: bool) -> None:
  client = OpenAI(base_url="http://localhost:4100", api_key="sk-local-master-key")
  extra = {"tools": [{"type": "web_search"}]} if web_search else {}
  started = time.monotonic()
  stream = client.chat.completions.create(
    model=model, messages=[{"role": "user", "content": question}], stream=True, extra_body=extra
  )
  for chunk in stream:
    delta = chunk.choices[0].delta
    elapsed = time.monotonic() - started
    if delta.tool_calls:
      call = delta.tool_calls[0].function
      print(f"{elapsed:5.2f}s tool_calls {call.name} {call.arguments}")
    elif delta.content:
      print(f"{elapsed:5.2f}s content  {delta.content!r}")
    if chunk.choices[0].finish_reason:
      print(f"{elapsed:5.2f}s finish   {chunk.choices[0].finish_reason}")


if __name__ == "__main__":
  main(sys.argv[1], sys.argv[2], "--web-search" in sys.argv)
