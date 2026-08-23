from openai import OpenAI
from openai.types.responses import Response

DEFAULT_LITELLM_MODEL = "openai-search-agent"


def create_agentcore_client(base_url: str, api_key: str) -> OpenAI:
  """Create an OpenAI client for LiteLLM backed by AgentCore Web Search."""
  return OpenAI(base_url=f"{base_url.rstrip('/')}/v1", api_key=api_key)


def search_with_agentcore(
  client: OpenAI,
  query: str,
  model: str = DEFAULT_LITELLM_MODEL,
) -> Response:
  """Invoke AgentCore Web Search through LiteLLM's Responses API interception."""
  return client.responses.create(
    model=model,
    input=query,
    tools=[{"type": "web_search"}],
  )
