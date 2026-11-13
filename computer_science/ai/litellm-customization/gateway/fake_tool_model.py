"""7단계: 모델 주도 tool 호출을 흉내 내는 결정적인 가짜 모델.

tool 결과가 없으면 litellm_web_search 호출을 요청하고, tool 결과가 있으면 그 수를 세어 답한다.
"""

import json
import uuid

from litellm import ModelResponse
from litellm.llms.custom_llm import CustomLLM

from gateway.ai_router import last_user_text

WEB_SEARCH_TOOL = "litellm_web_search"


def tool_call_response(query: str) -> ModelResponse:
  """모델이 검색 tool 호출을 결정한 응답을 만든다."""
  call = {
    "id": f"call_{uuid.uuid4().hex[:12]}",
    "type": "function",
    "function": {"name": WEB_SEARCH_TOOL, "arguments": json.dumps({"query": query}, ensure_ascii=False)},
  }
  return ModelResponse(
    choices=[{"index": 0, "finish_reason": "tool_calls", "message": {"role": "assistant", "content": None, "tool_calls": [call]}}]
  )


def answer_response(tool_messages: list[dict]) -> ModelResponse:
  """tool 결과를 받은 뒤의 최종 답변을 만든다."""
  content = f"검색 결과 {len(tool_messages)}건을 근거로 답한 가짜 모델의 답변입니다."
  return ModelResponse(choices=[{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": content}}])


class FakeToolModel(CustomLLM):
  """tool 결과 유무만 보고 다음 행동을 정하는 가짜 모델."""

  async def acompletion(self, model: str, messages: list, *args, **kwargs) -> ModelResponse:
    """tool 메시지가 있으면 답하고, 없으면 검색 tool 호출을 요청한다."""
    tool_messages = [message for message in messages if message.get("role") == "tool"]
    if tool_messages:
      return answer_response(tool_messages)
    return tool_call_response(last_user_text(messages))


fake_tool_model = FakeToolModel()
