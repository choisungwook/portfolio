"""Benchmark the MLX BF16 model."""

from macos.benchmark import run

if __name__ == "__main__":
  run("mlx-community/Qwen2.5-3B-Instruct-bf16", "bf16")
