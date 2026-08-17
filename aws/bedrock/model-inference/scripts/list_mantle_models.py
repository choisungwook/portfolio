#!/usr/bin/env python3
"""List models from the OpenAI-compatible Bedrock Mantle endpoint."""

from openai import OpenAI

from bedrock_examples.mantle_api import list_models


def main() -> None:
  """Print model IDs exposed by the configured Mantle endpoint."""
  client = OpenAI()
  for model_id in list_models(client):
    print(model_id)


if __name__ == "__main__":
  main()
