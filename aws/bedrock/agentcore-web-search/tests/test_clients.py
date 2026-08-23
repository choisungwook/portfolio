from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from agentcore_web_search.bedrock_client import create_bedrock_client, search_with_bedrock
from agentcore_web_search.direct_agentcore_web_search import preview
from agentcore_web_search.litellm_with_agentcore_web_search import (
  create_client,
  print_interception,
  search,
)


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


def test_create_client_points_at_litellm(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setenv("LITELLM_PORT", "4001")
  monkeypatch.setenv("LITELLM_MASTER_KEY", "key")

  client = create_client()

  assert str(client.base_url) == "http://localhost:4001/v1/"


def test_search_sends_openai_web_search_tool() -> None:
  client = Mock()

  search(client, "query")

  client.responses.create.assert_called_once_with(
    model="openai-search-agent",
    input="query",
    tools=[{"type": "web_search"}],
  )


def test_print_interception_fails_without_litellm_tool() -> None:
  response = Mock(tools=[SimpleNamespace(type="web_search")], output=[])

  with pytest.raises(SystemExit):
    print_interception(response)


def test_print_interception_passes_with_litellm_tool(capsys: pytest.CaptureFixture[str]) -> None:
  tool = SimpleNamespace(type="function", name="litellm_web_search")
  response = Mock(tools=[tool], output=[])

  print_interception(response)

  assert "클라이언트가 처리한 tool call: 0건" in capsys.readouterr().out


def test_preview_flattens_and_truncates() -> None:
  assert preview("  줄바꿈\n과   공백  ") == "줄바꿈 과 공백"
  assert len(preview("가" * 200)) == 80
