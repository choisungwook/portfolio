import importlib.util
from pathlib import Path
from unittest.mock import Mock


def load_vllm_app():
  path = Path(__file__).parents[1] / "ai-provider" / "vllm" / "app.py"
  spec = importlib.util.spec_from_file_location("vllm_app", path)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module


def test_request_search_enables_vllm_server_tool() -> None:
  app = load_vllm_app()
  client = Mock()

  app.request_search(client, "오늘 날씨")

  call = client.responses.create.call_args.kwargs
  assert call["model"] == "vllm-provider-search"
  assert call["input"] == "오늘 날씨"
  assert "exactly once" in call["instructions"]
  assert call["tools"][0] == {"type": "web_search_preview"}
  assert call["tools"][1]["name"] == "web_search_preview"
  assert call["tool_choice"] == "auto"
  assert call["temperature"] == 0
