#!/usr/bin/env python3
"""Generate an image through AWS-native Bedrock InvokeModel."""

import argparse
import os
from pathlib import Path

import boto3

from bedrock_examples.runtime_api import generate_image


def parse_args() -> argparse.Namespace:
  """Parse image generation inputs."""
  parser = argparse.ArgumentParser()
  parser.add_argument("prompt")
  parser.add_argument(
    "--model-id",
    default=os.getenv("BEDROCK_RUNTIME_IMAGE_MODEL", "amazon.nova-canvas-v1:0"),
  )
  parser.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
  parser.add_argument("--seed", type=int, default=42)
  parser.add_argument("--output", type=Path, default=Path("output.png"))
  return parser.parse_args()


def main() -> None:
  """Write one generated image to the requested path."""
  args = parse_args()
  client = boto3.client("bedrock-runtime", region_name=args.region)
  image = generate_image(client, args.model_id, args.prompt, args.seed)
  args.output.write_bytes(image)
  print(args.output.resolve())


if __name__ == "__main__":
  main()
