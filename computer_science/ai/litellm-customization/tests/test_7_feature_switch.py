"""7단계: tools 표식이 기능 플래그로 바뀌고 provider로 넘어가는 tools에서 사라지는지 확인한다."""

from litellm.proxy._types import UserAPIKeyAuth

from gateway.feature_switch import FeatureSwitch, enabled_features

FUNCTION_TOOL = {"type": "function", "function": {"name": "get_time", "parameters": {"type": "object"}}}


async def switch(data: dict, target_model: str | None = None) -> dict:
  return await FeatureSwitch(target_model).async_pre_call_hook(UserAPIKeyAuth(), None, data, "acompletion")


async def test_marker_becomes_feature_flag_and_is_removed() -> None:
  data = await switch({"model": "chat-small", "tools": [{"type": "web_search"}, FUNCTION_TOOL]})
  assert enabled_features(data) == ["web_search"]
  assert data["tools"] == [FUNCTION_TOOL]
  assert data["model"] == "chat-small"


async def test_marker_only_request_drops_tools_and_tool_choice() -> None:
  data = await switch({"model": "chat-small", "tools": [{"type": "web_search"}], "tool_choice": "auto"}, "gateway-search")
  assert "tools" not in data and "tool_choice" not in data
  assert data["model"] == "gateway-search"


async def test_request_without_marker_is_untouched() -> None:
  original = {"model": "chat-small", "tools": [FUNCTION_TOOL]}
  data = await switch(dict(original))
  assert data == original
