"""7단계: 요청의 tools 표식을 해석해 gateway 기능을 켜고, 표식을 지운 뒤 다음 단계로 넘기는 훅."""

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.metadata_tagger import add_spend_logs_metadata

MARKER_TYPES = {"web_search"}
FEATURES_KEY = "gateway_features"


def split_markers(tools: list[dict]) -> tuple[list[str], list[dict]]:
  """tools를 (켤 기능 이름 목록, provider에 넘길 나머지 tools)로 나눈다."""
  features = [tool["type"] for tool in tools if tool.get("type") in MARKER_TYPES]
  remaining = [tool for tool in tools if tool.get("type") not in MARKER_TYPES]
  return features, remaining


def enabled_features(data: dict) -> list[str]:
  """앞 훅이 켠 gateway 기능 목록을 돌려준다."""
  return data.get("metadata", {}).get(FEATURES_KEY, [])


class FeatureSwitch(CustomLogger):
  """tools의 web_search 표식을 metadata 기능 플래그로 옮기고 tools에서 지운다."""

  def __init__(self, target_model: str | None = None) -> None:
    super().__init__()
    self.target_model = target_model

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """표식이 있으면 기능을 켜고, target_model이 있으면 그 별칭으로 보낸다."""
    features, remaining = split_markers(data.get("tools") or [])
    if not features:
      return data
    if remaining:
      data["tools"] = remaining
    else:
      data.pop("tools", None)
      data.pop("tool_choice", None)  # tools 없이 tool_choice만 남으면 provider가 400을 낸다
    data.setdefault("metadata", {})[FEATURES_KEY] = features
    if self.target_model:
      data["model"] = self.target_model
    return add_spend_logs_metadata(data, {"feature_switch": features})


class ToolsAudit(CustomLogger):
  """관찰용 훅. 자기 차례에 받은 tools의 type 목록을 spend log에 남긴다."""

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """data는 바꾸지 않고 tools type만 기록한다."""
    seen = [tool.get("type") for tool in data.get("tools") or []]
    return add_spend_logs_metadata(data, {"tools_seen_by_next_hook": seen})


feature_switch = FeatureSwitch()
feature_switch_to_search = FeatureSwitch(target_model="gateway-search")
tools_audit = ToolsAudit()
