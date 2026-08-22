"""Benchmark the MLX 4-bit model."""

from macos.benchmark import run

if __name__ == "__main__":
  run("mlx-community/Qwen2.5-3B-Instruct-4bit", "4bit")
