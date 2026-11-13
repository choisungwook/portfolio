"""4단계: 키워드 규칙이 모델을 바꾸는 경우와 바꾸지 않는 경우를 확인한다."""

from litellm.proxy._types import UserAPIKeyAuth

from gateway.keyword_router import KeywordRouter


async def route(content: str | list) -> dict:
  data = {"model": "chat-small", "messages": [{"role": "user", "content": content}]}
  return await KeywordRouter().async_pre_call_hook(
    user_api_key_dict=UserAPIKeyAuth(), cache=None, data=data, call_type="acompletion"
  )


async def test_keyword_switches_to_large_model_and_records_reason() -> None:
  data = await route("파이썬 코드 리뷰해줘")
  assert data["model"] == "chat-large"
  assert data["metadata"]["spend_logs_metadata"]["keyword_router"] == "chat-small->chat-large (코드)"


async def test_question_without_keyword_keeps_model() -> None:
  data = await route([{"type": "text", "text": "이 두 설명의 차이점을 알려줘"}])
  assert data["model"] == "chat-small"  # 거짓 음성: 무거운 질문인데 키워드가 없다


async def test_substring_match_causes_false_positive() -> None:
  data = await route("코드명 프로젝트가 뭐야?")
  assert data["model"] == "chat-large"  # 거짓 양성: '코드명'에 '코드'가 들어 있다
