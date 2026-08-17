"""AWS-native Amazon Bedrock API examples."""

import base64
import json
from typing import Any


def list_text_models(client: Any) -> list[str]:
  """Return text-output foundation model IDs from a Bedrock control client."""
  response = client.list_foundation_models(byOutputModality="TEXT")
  return [model["modelId"] for model in response["modelSummaries"]]


def complete_text(client: Any, model_id: str, prompt: str) -> str:
  """Generate one text response through the Bedrock Converse API."""
  response = client.converse(
    modelId=model_id,
    messages=[{"role": "user", "content": [{"text": prompt}]}],
    inferenceConfig={"maxTokens": 300, "temperature": 0.2},
  )
  return response["output"]["message"]["content"][0]["text"]


def generate_image(
  client: Any,
  model_id: str,
  prompt: str,
  seed: int,
) -> bytes:
  """Generate one image through InvokeModel and return its decoded bytes."""
  request = {
    "taskType": "TEXT_IMAGE",
    "textToImageParams": {"text": prompt},
    "imageGenerationConfig": {
      "numberOfImages": 1,
      "height": 1024,
      "width": 1024,
      "seed": seed,
    },
  }
  response = client.invoke_model(
    modelId=model_id,
    body=json.dumps(request),
    accept="application/json",
    contentType="application/json",
  )
  response_body = json.loads(response["body"].read())
  return base64.b64decode(response_body["images"][0])
