"""Step 4 - the server caches, but it does not remember.

OpenAI caches automatically. There is nothing to declare: send a long enough
identical prefix twice and the hit shows up under
`usage.prompt_tokens_details.cached_tokens`.

Two numbers make the point:

- cached_tokens > 0 on call 2 -> the server did reuse prefill work
- prompt_tokens counts the whole prompt on both calls -> you still sent it all

The system prompt below is padded on purpose, because automatic caching only
kicks in past a minimum prefix length.

Needs OPENAI_API_KEY.
"""

import os

from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = "gpt-5.6-luna"

PARAGRAPH = (
  "This assistant answers questions about an internal deployment runbook. "
  "It always cites the step number it is quoting, never invents a step, and "
  "asks for the environment name when the question is ambiguous. "
)
LONG_SYSTEM = {"role": "system", "content": PARAGRAPH * 400}


def ask(question: str) -> None:
  """Send the same padded system prompt each time and print the cache counters."""
  response = client.chat.completions.create(
    model=MODEL,
    max_completion_tokens=2000,
    messages=[LONG_SYSTEM, {"role": "user", "content": question}],
  )
  usage = response.usage
  details = usage.prompt_tokens_details
  cached = getattr(details, "cached_tokens", 0) if details else 0
  print(f"  prompt_tokens={usage.prompt_tokens} cached_tokens={cached}")


def main() -> None:
  print("call 1 (populates the cache)")
  ask("1단계가 뭐야?")
  print("call 2 (same system prompt, different question)")
  ask("2단계가 뭐야?")
  print(
    "\ncached_tokens > 0 means the server reused prefill work for a prefix you\n"
    "sent again. It does not mean the server kept call 1 - call 2 still had to\n"
    "transmit the whole prefix, and carried no conversation history at all."
  )


if __name__ == "__main__":
  main()
