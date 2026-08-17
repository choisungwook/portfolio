"""Offline tests for OpenAI-compatible Bedrock Mantle calls."""

from types import SimpleNamespace

from bedrock_examples.mantle_api import complete_text, list_models


class FakeModels:
  """Return a fixed Mantle model list."""

  def list(self) -> SimpleNamespace:
    """Return OpenAI-shaped model entries."""
    return SimpleNamespace(
      data=[SimpleNamespace(id="openai.gpt-oss-20b")],
    )


class FakeResponses:
  """Record a Responses API call."""

  def __init__(self) -> None:
    """Initialize the request record."""
    self.request: dict = {}

  def create(self, **kwargs: object) -> SimpleNamespace:
    """Return fixed response text."""
    self.request = kwargs
    return SimpleNamespace(output_text="hello")


class FakeOpenAIClient:
  """Expose fake Models and Responses resources."""

  def __init__(self) -> None:
    """Initialize fake resources."""
    self.models = FakeModels()
    self.responses = FakeResponses()


def test_list_models() -> None:
  """List IDs returned by Mantle Models API."""
  assert list_models(FakeOpenAIClient()) == ["openai.gpt-oss-20b"]


def test_complete_text_disables_storage() -> None:
  """Use the Responses API without retaining conversation state."""
  client = FakeOpenAIClient()
  result = complete_text(client, "openai.gpt-oss-20b", "hello")

  assert result == "hello"
  assert client.responses.request["store"] is False
