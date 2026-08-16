"""Step 4 - the server caches, but it does not remember.

Anthropic caching is explicit, unlike OpenAI's automatic caching: mark the end
of the stable prefix with `cache_control`, then read the two counters back.

Two numbers make the point:

- cache_read_input_tokens > 0 on call 2 -> the server did reuse prefill work
- the whole prefix was still transmitted on both calls

The marked prefix has to clear a model-specific minimum (1024 tokens on
Sonnet 5), so the system prompt below is padded on purpose. Anything shorter
is silently not cached, with no error.

Needs ANTHROPIC_API_KEY.
"""

import os

import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-sonnet-5"

PARAGRAPH = (
  "This assistant answers questions about an internal deployment runbook. "
  "It always cites the step number it is quoting, never invents a step, and "
  "asks for the environment name when the question is ambiguous. "
)
LONG_SYSTEM = PARAGRAPH * 120


def ask(question: str) -> None:
  """Send the same padded system prompt each time and print the cache counters."""
  response = client.messages.create(
    model=MODEL,
    max_tokens=2000,
    system=[
      {
        "type": "text",
        "text": LONG_SYSTEM,
        "cache_control": {"type": "ephemeral"},  # marks the end of the prefix
      }
    ],
    messages=[{"role": "user", "content": question}],
  )
  usage = response.usage
  print(
    f"  uncached={usage.input_tokens} "
    f"cache_write={usage.cache_creation_input_tokens} "
    f"cache_read={usage.cache_read_input_tokens}"
  )


def main() -> None:
  print("call 1 (writes the cache)")
  ask("1단계가 뭐야?")
  print("call 2 (same system prompt, different question)")
  ask("2단계가 뭐야?")
  print(
    "\ncache_read > 0 means the server reused prefill work for a prefix you\n"
    "sent again. It does not mean the server kept call 1 - call 2 still had to\n"
    "transmit the whole prefix, and carried no conversation history at all."
  )


if __name__ == "__main__":
  main()
