"""Verify that a 7B BF16 model cannot fit in 12 GiB VRAM."""

import json
from dataclasses import asdict
from pathlib import Path

from model_loader.common import load_model, save_result

MODEL_ID = "Qwen/Qwen2.5-7B-Instruct"


def main() -> None:
  """Exit successfully only when CUDA OOM is observed."""
  result = load_model(MODEL_ID)
  save_result(result, Path("results/ch5-7b-bf16-oom.json"))
  print(json.dumps(asdict(result), indent=2))
  if result.loaded:
    raise RuntimeError("7B BF16 unexpectedly loaded; the expected OOM was not reproduced")
  if not result.expected_cuda_oom:
    raise RuntimeError(f"Model load failed for a non-OOM reason: {result.error}")


if __name__ == "__main__":
  main()
