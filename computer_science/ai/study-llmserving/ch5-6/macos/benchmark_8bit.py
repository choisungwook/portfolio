"""Benchmark the MLX 8-bit model."""

from macos.benchmark import run

if __name__ == "__main__":
  run("mlx-community/Qwen2.5-3B-Instruct-8bit", "8bit")
