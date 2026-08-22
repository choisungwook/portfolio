"""Verify that a 3B BF16 model loads into 16 GiB VRAM."""

import json
from dataclasses import asdict
from pathlib import Path

from model_loader.common import load_model, save_result

MODEL_ID = "Qwen/Qwen2.5-3B-Instruct"


def main() -> None:
  """Exit successfully only when the BF16 model reaches CUDA."""
  result = load_model(MODEL_ID)
  save_result(result, Path("results/ch5-3b-bf16-load.json"))
  print(json.dumps(asdict(result), indent=2))
  if not result.loaded:
    raise RuntimeError(f"3B BF16 failed to load: {result.error}")


if __name__ == "__main__":
  main()
