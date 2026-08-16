"""Step 2 - the same two questions, with the history accumulated by the caller.

Nothing about the model changed from 01_stateless.py. `history` grows, and the
whole list is resent on every call. That resending is what multi-turn means.

Needs OPENAI_API_KEY.
"""

import os

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = "gpt-5.6-luna"
SYSTEM = {"role": "system", "content": "You are a concise assistant. Answer in Korean."}


def ask(history: list[dict], question: str) -> str:
  """Append the question, resend the whole history, append the reply, return it."""
  history.append({"role": "user", "content": question})

  response = client.chat.completions.create(
    model=MODEL,
    max_completion_tokens=2000,
    messages=[SYSTEM] + history,  # the system prompt is messages[0] here
  )
  answer = response.choices[0].message.content

  history.append({"role": "assistant", "content": answer})
  print(f"  [{len(history)} messages sent, "
        f"{response.usage.prompt_tokens} prompt tokens]")
  return answer


def main() -> None:
  history: list[dict] = []
  print("turn 1 >", ask(history, "내 이름은 악분이야. 기억해줘."))
  print("turn 2 >", ask(history, "내 이름이 뭐라고 했지?"))
  print("turn 3 >", ask(history, "내가 지금까지 몇 번 질문했지?"))


if __name__ == "__main__":
  main()
