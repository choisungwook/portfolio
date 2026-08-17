"""Offline tests for AWS-native Bedrock calls."""

import base64
import io
import json

from bedrock_examples.runtime_api import complete_text, generate_image, list_text_models


class FakeBedrockClient:
  """Record Bedrock control calls and return a fixed catalog."""

  def list_foundation_models(self, **kwargs: object) -> dict:
    """Return one text model."""
    assert kwargs == {"byOutputModality": "TEXT"}
    return {"modelSummaries": [{"modelId": "amazon.nova-micro-v1:0"}]}


class FakeRuntimeClient:
  """Record Bedrock Runtime calls and return fixed responses."""

  def __init__(self) -> None:
    """Initialize request records."""
    self.converse_request: dict = {}
    self.invoke_request: dict = {}

  def converse(self, **kwargs: object) -> dict:
    """Return one text response."""
    self.converse_request = kwargs
    return {"output": {"message": {"content": [{"text": "hello"}]}}}

  def invoke_model(self, **kwargs: object) -> dict:
    """Return one base64-encoded image response."""
    self.invoke_request = kwargs
    encoded = base64.b64encode(b"image-bytes").decode()
    return {"body": io.BytesIO(json.dumps({"images": [encoded]}).encode())}


def test_list_text_models() -> None:
  """List IDs returned by the Bedrock control endpoint."""
  assert list_text_models(FakeBedrockClient()) == ["amazon.nova-micro-v1:0"]


def test_complete_text_uses_converse() -> None:
  """Send a model-independent Converse request."""
  client = FakeRuntimeClient()
  result = complete_text(client, "amazon.nova-micro-v1:0", "hello")

  assert result == "hello"
  assert client.converse_request["modelId"] == "amazon.nova-micro-v1:0"


def test_generate_image_uses_invoke_model() -> None:
  """Send a Nova Canvas native request and decode the image."""
  client = FakeRuntimeClient()
  result = generate_image(client, "amazon.nova-canvas-v1:0", "a whale", 42)

  assert result == b"image-bytes"
  body = json.loads(client.invoke_request["body"])
  assert body["taskType"] == "TEXT_IMAGE"
  assert body["imageGenerationConfig"]["seed"] == 42
