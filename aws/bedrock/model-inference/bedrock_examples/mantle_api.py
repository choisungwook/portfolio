"""OpenAI-compatible Amazon Bedrock Mantle API examples."""

from typing import Any


def list_models(client: Any) -> list[str]:
  """Return model IDs exposed by the Mantle Models API."""
  return [model.id for model in client.models.list().data]


def complete_text(client: Any, model_id: str, prompt: str) -> str:
  """Generate one non-stored response through the Mantle Responses API."""
  response = client.responses.create(
    model=model_id,
    input=prompt,
    store=False,
  )
  return response.output_text
