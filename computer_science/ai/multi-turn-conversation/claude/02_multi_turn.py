"""Step 2 - the same two questions, with the history accumulated by the caller.

Nothing about the model changed from 01_stateless.py. `history` grows, and the
whole list is resent on every call. That resending is what multi-turn means.

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


def ask(history: list[dict], question: str) -> str:
  """Append the question, resend the whole history, append the reply, return it."""
  history.append({"role": "user", "content": question})

  response = client.messages.create(
    model=MODEL,
    max_tokens=2000,
    system=SYSTEM,  # stays out of `history`, unlike the OpenAI shape
    messages=history,
  )
  answer = text_of(response.content)

  history.append({"role": "assistant", "content": answer})
  print(f"  [{len(history)} messages sent, "
        f"{response.usage.input_tokens} input tokens]")
  return answer


def main() -> None:
  history: list[dict] = []
  print("turn 1 >", ask(history, "내 이름은 악분이야. 기억해줘."))
  print("turn 2 >", ask(history, "내 이름이 뭐라고 했지?"))
  print("turn 3 >", ask(history, "내가 지금까지 몇 번 질문했지?"))


if __name__ == "__main__":
  main()
