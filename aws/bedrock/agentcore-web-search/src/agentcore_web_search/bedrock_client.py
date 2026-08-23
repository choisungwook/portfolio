from aws_bedrock_token_generator import provide_token
from openai import OpenAI
from openai.types.responses import Response

DEFAULT_MODEL = "openai.gpt-5.6-luna"
DEFAULT_REGION = "us-east-1"


def create_bedrock_client(region: str = DEFAULT_REGION) -> OpenAI:
  """Create an OpenAI client authenticated with a short-term Bedrock token."""
  return OpenAI(
    base_url=f"https://bedrock-mantle.{region}.api.aws/openai/v1",
    api_key=provide_token(region=region),
  )


def search_with_bedrock(
  client: OpenAI,
  query: str,
  model: str = DEFAULT_MODEL,
) -> Response:
  """Use the Bedrock Web Search server tool through the Responses API."""
  return client.responses.create(
    model=model,
    input=query,
    tools=[{"type": "web_search", "external_web_access": False}],
  )
