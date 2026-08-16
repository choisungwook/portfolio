"""Step 1 - prove the Messages API keeps no state.

Two separate calls. The second asks about something only the first one said,
and cannot answer, because nothing about call 1 was sent in call 2.

Needs ANTHROPIC_API_KEY.
"""

import os

import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-sonnet-5"
SYSTEM = "You are a concise assistant. Answer in Korean."


def text_of(content: list) -> str:
  """Join the text blocks of a reply. The response is a block list, not a string."""
  return "".join(block.text for block in content if block.type == "text")


def main() -> None:
  # Call 1. The whole request is the system prompt plus one question.
  first = client.messages.create(
    model=MODEL,
    max_tokens=2000,
    system=SYSTEM,  # the system prompt is its own field here, not messages[0]
    messages=[{"role": "user", "content": "내 이름은 악분이야. 기억해줘."}],
  )
  print("turn 1 >", text_of(first.content))

  # Call 2. A brand new request. Call 1 appears nowhere in it.
  second = client.messages.create(
    model=MODEL,
    max_tokens=2000,
    system=SYSTEM,
    messages=[{"role": "user", "content": "내 이름이 뭐라고 했지?"}],
  )
  print("turn 2 >", text_of(second.content))


if __name__ == "__main__":
  main()
