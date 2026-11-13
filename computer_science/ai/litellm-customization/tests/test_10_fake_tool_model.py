"""10단계: 모델 주도 흐름을 흉내 내는 가짜 모델이 tool 결과 유무로 행동을 바꾸는지 확인한다."""

import json

from gateway.fake_tool_model import WEB_SEARCH_TOOL, FakeToolModel

QUESTION = {"role": "user", "content": "LiteLLM 최신 버전"}


async def test_model_requests_search_when_no_tool_result() -> None:
  response = await FakeToolModel().acompletion("tool", [QUESTION])
  call = response.choices[0].message.tool_calls[0]
  assert response.choices[0].finish_reason == "tool_calls"
  assert call.function.name == WEB_SEARCH_TOOL
  assert json.loads(call.function.arguments) == {"query": "LiteLLM 최신 버전"}


async def test_model_answers_after_tool_result() -> None:
  tool_result = {"role": "tool", "tool_call_id": "call_1", "content": "검색 결과"}
  response = await FakeToolModel().acompletion("tool", [QUESTION, tool_result])
  assert response.choices[0].finish_reason == "stop"
  assert "1건" in response.choices[0].message.content
