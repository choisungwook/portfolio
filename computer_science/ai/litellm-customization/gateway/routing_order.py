"""5단계: 같은 요청을 반대 방향으로 바꾸는 훅 두 개와, 앞 훅의 결정을 표시하는 metadata 표식."""

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.keyword_router import HEAVY_MODEL, find_keyword, last_user_text
from gateway.metadata_tagger import add_spend_logs_metadata

LOCK_KEY = "routing_locked_by"
LIGHT_MODEL = "chat-small"
SHORT_QUESTION_LENGTH = 20


def locked_by(data: dict) -> str | None:
  """앞 훅이 남긴 라우팅 결정 표식을 돌려준다. 없으면 None."""
  return data.get("metadata", {}).get(LOCK_KEY)


def decide_model(data: dict, model: str, owner: str, use_lock: bool) -> dict:
  """data의 model을 바꾸고 spend log에 남긴다. use_lock이면 표식을 확인하고 남긴다.

  Args:
    data: 요청 본문
    model: 바꿀 별칭
    owner: 결정한 훅 이름
    use_lock: True면 이미 표식이 있을 때 바꾸지 않고, 바꾼 뒤 표식을 남긴다

  Returns:
    수정했거나 그대로 둔 data
  """
  if use_lock and locked_by(data):
    return add_spend_logs_metadata(data, {owner: f"skip (locked by {locked_by(data)})"})
  data["model"] = model
  if use_lock:
    data.setdefault("metadata", {})[LOCK_KEY] = owner
  return add_spend_logs_metadata(data, {owner: f"-> {model}"})


class UpgradeHook(CustomLogger):
  """훅 A. 무거운 질문 키워드가 있으면 큰 모델로 올린다."""

  def __init__(self, use_lock: bool) -> None:
    super().__init__()
    self.use_lock = use_lock

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """키워드가 있으면 chat-large로 결정한다."""
    if find_keyword(last_user_text(data.get("messages", []))) is None:
      return data
    return decide_model(data, HEAVY_MODEL, "upgrade_hook", self.use_lock)


class DowngradeHook(CustomLogger):
  """훅 B. 짧은 질문은 비용을 아끼려고 작은 모델로 내린다."""

  def __init__(self, use_lock: bool) -> None:
    super().__init__()
    self.use_lock = use_lock

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """마지막 질문이 SHORT_QUESTION_LENGTH자 이하면 chat-small로 결정한다."""
    if len(last_user_text(data.get("messages", []))) > SHORT_QUESTION_LENGTH:
      return data
    return decide_model(data, LIGHT_MODEL, "downgrade_hook", self.use_lock)


upgrade_hook = UpgradeHook(use_lock=False)
downgrade_hook = DowngradeHook(use_lock=False)
upgrade_hook_locking = UpgradeHook(use_lock=True)
downgrade_hook_locking = DowngradeHook(use_lock=True)
