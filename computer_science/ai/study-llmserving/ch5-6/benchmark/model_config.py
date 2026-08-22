"""Inspect the attention layout of a real Hugging Face model."""

import json
import os

from transformers import AutoConfig

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")


def main() -> None:
  """Print attention heads and their KV sharing ratio."""
  config = AutoConfig.from_pretrained(MODEL_ID)
  attention_heads = int(config.num_attention_heads)
  kv_heads = int(config.num_key_value_heads)
  report = {
    "model": MODEL_ID,
    "attention": "MHA" if attention_heads == kv_heads else "GQA",
    "attention_heads": attention_heads,
    "kv_heads": kv_heads,
    "queries_per_kv_head": attention_heads // kv_heads,
    "hidden_layers": int(config.num_hidden_layers),
    "hidden_size": int(config.hidden_size),
  }
  print(json.dumps(report, indent=2))


if __name__ == "__main__":
  main()
