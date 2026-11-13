# /// script
# requires-python = ">=3.13"
# dependencies = ["openai==3.50.0"]
# ///
"""OpenAI 공식 SDK로 백엔드에 질문 하나를 보낸다. 백엔드가 OpenAI 스펙을 따르는지 확인하는 클라이언트다.

사용: uv run scripts/chat.py --user alice [--session chat-xxx] "질문"
"""
import argparse

from openai import OpenAI


def parse_args() -> argparse.Namespace:
  """명령행 인자를 읽는다."""
  parser = argparse.ArgumentParser()
  parser.add_argument("--user", required=True, help="actorId")
  parser.add_argument("--session", help="sessionId. 없으면 백엔드가 새 채팅창을 만든다")
  parser.add_argument("question")
  return parser.parse_args()


def main() -> None:
  """질문을 보내고 답변, sessionId, 메모리 사용 내역을 출력한다."""
  args = parse_args()
  client = OpenAI(base_url="http://localhost:8000/v1", api_key="unused")
  headers = {"X-Session-Id": args.session} if args.session else {}
  raw = client.chat.completions.with_raw_response.create(
    model="qwen2.5:3b",
    user=args.user,
    messages=[{"role": "user", "content": args.question}],
    extra_headers=headers,
  )
  completion = raw.parse()
  used = completion.model_extra["memory"]
  print(f"session: {raw.headers['x-session-id']}")
  print(f"answer : {completion.choices[0].message.content}")
  print(f"memory : short_term_messages={used['short_term_messages']} long_term_records={len(used['long_term_records'])}")
  for record in used["long_term_records"]:
    print(f"  - [{record['namespaces'][0]}] {record['text']}")


if __name__ == "__main__":
  main()
