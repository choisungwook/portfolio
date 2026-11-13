"""11단계: 훅과 provider의 판단을 실행 순서대로 spend log에 남기고, 사용자 원문은 남기지 않는다."""

import hashlib
import re

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.keyword_router import last_user_text
from gateway.metadata_tagger import TRAIL_KEY, add_spend_logs_metadata

# \w와 \b는 한글을 단어 문자로 본다. "owner@example.com입니다"의 조사까지 먹지 않도록 ASCII로 제한한다.
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
PHONE = re.compile(r"(?<!\d)01\d-\d{3,4}-\d{4}(?!\d)")


def question_fingerprint(question: str) -> dict:
  """원문 대신 남길 질문의 지문. 같은 질문인지는 비교할 수 있지만 내용은 복원할 수 없다."""
  return {"question_sha256": hashlib.sha256(question.encode()).hexdigest()[:16], "question_chars": len(question)}


def record_from_provider(provider_kwargs: dict, values: dict) -> None:
  """custom provider가 받은 kwargs의 metadata에 판단을 남긴다. 이 dict가 spend log로 이어진다."""
  metadata = (provider_kwargs.get("litellm_params") or {}).get("metadata")
  if metadata is not None:
    add_spend_logs_metadata({"metadata": metadata}, values)


def mask_contacts(text: str) -> tuple[str, int]:
  """이메일과 휴대폰 번호를 가린다. (가린 문자열, 가린 개수)를 돌려준다."""
  text, emails = EMAIL.subn("[email]", text)
  text, phones = PHONE.subn("[phone]", text)
  return text, emails + phones


class TrailStart(CustomLogger):
  """체인 맨 앞 훅. 질문 지문과 빈 decisions 목록을 만든다."""

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """뒤 훅들이 decisions 목록에 차례로 추가할 수 있게 준비한다."""
    metadata = data.setdefault("metadata", {})
    fingerprint = question_fingerprint(last_user_text(data.get("messages", [])))
    metadata["spend_logs_metadata"] = {**(metadata.get("spend_logs_metadata") or {}), **fingerprint, TRAIL_KEY: []}
    return data


class ResponseMasker(CustomLogger):
  """post_call 훅. 응답 본문의 연락처를 가리고 가린 개수를 남긴다."""

  async def async_post_call_success_hook(self, data: dict, user_api_key_dict: UserAPIKeyAuth, response):
    """비스트리밍 응답의 message.content를 고친다."""
    masked_total = 0
    for choice in getattr(response, "choices", []):
      content = getattr(choice.message, "content", None)
      if isinstance(content, str):
        choice.message.content, masked = mask_contacts(content)
        masked_total += masked
    add_spend_logs_metadata(data, {"response_masker": f"masked {masked_total}"})
    return response


trail_start = TrailStart()
response_masker = ResponseMasker()
