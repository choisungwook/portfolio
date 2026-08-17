#!/usr/bin/env python3
"""Generate text through the OpenAI-compatible Bedrock Mantle endpoint."""

import argparse
import os

from openai import OpenAI

from bedrock_examples.mantle_api import complete_text


def parse_args() -> argparse.Namespace:
  """Parse the model and prompt."""
  parser = argparse.ArgumentParser()
  parser.add_argument("prompt")
  parser.add_argument(
    "--model-id",
    default=os.getenv("BEDROCK_MANTLE_TEXT_MODEL", "openai.gpt-oss-20b"),
  )
  return parser.parse_args()


def main() -> None:
  """Print one Mantle Responses API result."""
  args = parse_args()
  client = OpenAI()
  print(complete_text(client, args.model_id, args.prompt))


if __name__ == "__main__":
  main()
