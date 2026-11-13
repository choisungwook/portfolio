"""4단계: 마지막 사용자 메시지의 키워드로 모델을 바꾸는 pre_call 훅."""

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.metadata_tagger import add_spend_logs_metadata

HEAVY_KEYWORDS = ("코드", "분석", "비교", "설계")
HEAVY_MODEL = "chat-large"


def last_user_text(messages: list[dict]) -> str:
  """messages에서 마지막 user 메시지의 텍스트를 돌려준다. 없으면 빈 문자열."""
  for message in reversed(messages):
    if message.get("role") != "user":
      continue
    content = message.get("content")
    if isinstance(content, str):
      return content
    if isinstance(content, list):  # [{"type": "text", "text": "..."}] 형식
      return " ".join(part.get("text", "") for part in content if part.get("type") == "text")
  return ""


def find_keyword(text: str) -> str | None:
  """text에 들어 있는 첫 번째 무거운 질문 키워드를 돌려준다."""
  return next((keyword for keyword in HEAVY_KEYWORDS if keyword in text), None)


class KeywordRouter(CustomLogger):
  """무거운 질문 키워드가 있으면 요청 model을 chat-large로 바꾼다."""

  async def async_pre_call_hook(
    self,
    user_api_key_dict: UserAPIKeyAuth,
    cache,
    data: dict,
    call_type: str,
  ) -> dict:
    """키워드가 있으면 data["model"]을 교체하고 판단 근거를 spend log에 남긴다."""
    keyword = find_keyword(last_user_text(data.get("messages", [])))
    if keyword is None:
      return data
    requested = data.get("model")
    data["model"] = HEAVY_MODEL
    return add_spend_logs_metadata(data, {"keyword_router": f"{requested}->{HEAVY_MODEL} ({keyword})"})


keyword_router = KeywordRouter()
