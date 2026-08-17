import importlib.util
from pathlib import Path
from unittest.mock import Mock


def load_bedrock_app():
  path = Path(__file__).parents[1] / "ai-provider" / "bedrock" / "app.py"
  spec = importlib.util.spec_from_file_location("bedrock_app", path)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module


def test_request_search_uses_bedrock_provider_search() -> None:
  app = load_bedrock_app()
  client = Mock()

  app.request_search(client, "오늘 날씨")

  client.chat.completions.create.assert_called_once_with(
    model="bedrock-provider-search",
    messages=[{"role": "user", "content": "오늘 날씨"}],
    web_search_options={},
  )


def test_citation_urls_reads_provider_metadata() -> None:
  app = load_bedrock_app()
  message = Mock(
    provider_specific_fields={
      "citationsContent": [{"citations": [{"location": {"web": {"url": "https://example.com"}}}]}]
    }
  )

  assert app.citation_urls(message) == ["https://example.com"]
