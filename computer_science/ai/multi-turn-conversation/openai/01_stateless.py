"""Step 1 - prove the Chat Completions API keeps no state.

Two separate calls. The second asks about something only the first one said,
and cannot answer, because nothing about call 1 was sent in call 2.

Needs OPENAI_API_KEY.
"""

import os

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = "gpt-5.6-luna"
SYSTEM = {"role": "system", "content": "You are a concise assistant. Answer in Korean."}


def main() -> None:
  # Call 1. The whole request is the system prompt plus one question.
  first = client.chat.completions.create(
    model=MODEL,
    max_completion_tokens=2000,
    messages=[SYSTEM, {"role": "user", "content": "내 이름은 악분이야. 기억해줘."}],
  )
  print("turn 1 >", first.choices[0].message.content)

  # Call 2. A brand new request. Call 1 appears nowhere in it.
  second = client.chat.completions.create(
    model=MODEL,
    max_completion_tokens=2000,
    messages=[SYSTEM, {"role": "user", "content": "내 이름이 뭐라고 했지?"}],
  )
  print("turn 2 >", second.choices[0].message.content)


if __name__ == "__main__":
  main()
