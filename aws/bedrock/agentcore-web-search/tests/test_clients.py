from unittest.mock import Mock, patch

from agentcore_web_search.agentcore_client import (
  create_agentcore_client,
  search_with_agentcore,
)
from agentcore_web_search.bedrock_client import create_bedrock_client, search_with_bedrock


@patch("agentcore_web_search.bedrock_client.provide_token", return_value="token")
def test_create_bedrock_client(provide_token: Mock) -> None:
  client = create_bedrock_client("us-east-1")

  provide_token.assert_called_once_with(region="us-east-1")
  assert str(client.base_url) == "https://bedrock-mantle.us-east-1.api.aws/openai/v1/"


def test_search_with_bedrock() -> None:
  client = Mock()
  response = Mock()
  client.responses.create.return_value = response

  result = search_with_bedrock(client, "query", "openai.gpt-5.6-luna")

  assert result is response
  client.responses.create.assert_called_once_with(
    model="openai.gpt-5.6-luna",
    input="query",
    tools=[{"type": "web_search", "external_web_access": False}],
  )


def test_create_agentcore_client() -> None:
  client = create_agentcore_client("http://localhost:4001/", "key")

  assert str(client.base_url) == "http://localhost:4001/v1/"


def test_search_with_agentcore() -> None:
  client = Mock()
  response = Mock()
  client.responses.create.return_value = response

  result = search_with_agentcore(client, "query")

  assert result is response
  client.responses.create.assert_called_once_with(
    model="openai-search-agent",
    input="query",
    tools=[{"type": "web_search"}],
  )
