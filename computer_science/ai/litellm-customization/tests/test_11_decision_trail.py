"""11단계: 판단이 실행 순서대로 남고, 원문 대신 지문만 남으며, 응답의 연락처가 가려지는지 확인한다."""

from types import SimpleNamespace

from litellm.proxy._types import UserAPIKeyAuth

from gateway.decision_trail import ResponseMasker, mask_contacts, record_from_provider, trail_start
from gateway.feature_switch import feature_switch_to_search

QUESTION = "오늘 서울 날씨 알려줘"


async def test_decisions_keep_execution_order_without_raw_question() -> None:
  data = {"model": "chat-small", "messages": [{"role": "user", "content": QUESTION}], "tools": [{"type": "web_search"}]}
  for hook in (trail_start, feature_switch_to_search):
    data = await hook.async_pre_call_hook(UserAPIKeyAuth(), None, data, "acompletion")
  record_from_provider({"litellm_params": {"metadata": data["metadata"]}}, {"search_provider": "searxng-backup"})
  spend_logs_metadata = data["metadata"]["spend_logs_metadata"]
  assert [entry["hook"] for entry in spend_logs_metadata["decisions"]] == ["feature_switch", "search_provider"]
  assert spend_logs_metadata["question_chars"] == len(QUESTION)
  assert QUESTION not in str(spend_logs_metadata)


def test_mask_contacts_stops_at_korean_particles() -> None:
  masked, count = mask_contacts("메일은 owner@example.com입니다. 전화는 010-1234-5678로 주세요.")
  assert (masked, count) == ("메일은 [email]입니다. 전화는 [phone]로 주세요.", 2)


async def test_post_call_hook_masks_response_and_records_count() -> None:
  response = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="help@example.com"))])
  data = {"metadata": {"spend_logs_metadata": {"decisions": []}}}
  await ResponseMasker().async_post_call_success_hook(data, UserAPIKeyAuth(), response)
  assert response.choices[0].message.content == "[email]"
  assert data["metadata"]["spend_logs_metadata"]["decisions"] == [{"hook": "response_masker", "detail": "masked 1"}]
