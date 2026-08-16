"""Step 3 - a chat CLI where only the store changes.

    uv run claude/03_store.py --store memory --session demo
    uv run claude/03_store.py --store jsonl  --session demo
    uv run claude/03_store.py --store redis  --session demo

Quit with Ctrl-D, run the same command again, and ask "내 이름이 뭐야?".
Memory forgets, jsonl and redis remember. The request body is the same in all
three, which is why store.py lives one directory up and is shared by every
provider.

Needs ANTHROPIC_API_KEY.
"""

import argparse
import os
import sys
from pathlib import Path

import anthropic

# store.py sits one level up because storage is provider-independent - that is
# the conclusion of this step, so it is not copied into each provider folder.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from store import JsonlStore, MemoryStore, RedisStore

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-sonnet-5"
SYSTEM = "You are a concise assistant. Answer in Korean."


def text_of(content: list) -> str:
  """Join the text blocks of a reply. The response is a block list, not a string."""
  return "".join(block.text for block in content if block.type == "text")


def build_store(kind: str, session: str):
  """Pick a store by name. Redis is imported lazily so the other two need no server."""
  if kind == "memory":
    return MemoryStore()
  if kind == "jsonl":
    return JsonlStore(Path("sessions") / f"{session}.jsonl")
  if kind == "redis":
    import redis

    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    return RedisStore(redis.from_url(url), session)
  raise ValueError(f"unknown store: {kind}")


def ask(store, question: str) -> str:
  """Load the history from the store, resend it, persist both turns."""
  store.append({"role": "user", "content": question})
  history = store.load()

  response = client.messages.create(
    model=MODEL,
    max_tokens=2000,
    system=SYSTEM,
    messages=history,
  )
  answer = text_of(response.content)

  store.append({"role": "assistant", "content": answer})
  print(f"  [{len(history)} messages sent, "
        f"{response.usage.input_tokens} input tokens]")
  return answer


def main() -> None:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--store", choices=["memory", "jsonl", "redis"], default="memory")
  parser.add_argument("--session", default="demo")
  args = parser.parse_args()

  store = build_store(args.store, args.session)
  print(f"store={args.store} session={args.session} "
        f"({len(store.load())} messages restored). Ctrl-D to quit.")

  while True:
    try:
      question = input("you > ").strip()
    except EOFError:
      print()
      return
    if question:
      print("bot >", ask(store, question))


if __name__ == "__main__":
  main()
