"""4단계: 로컬 소형 모델(gemma2:2b)에게 질문을 보낼 모델을 묻는 pre_call 훅."""

import asyncio
import json
import time
from collections.abc import Callable

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.metadata_tagger import add_spend_logs_metadata

JUDGE_MODEL = "router-judge"
CANDIDATES = ("claude", "gemini")
JUDGE_TIMEOUT_SECONDS = 30.0  # CPU 전용 gemma2:2b는 한 번 판정에 수 초가 걸린다
JUDGE_PROMPT = """You route a user question to one of two models.
- claude: writing or reviewing code, debugging, system design, multi-step reasoning.
- gemini: casual chat, recommendations, short factual questions, translation.
Reply with one JSON object only: {"model": "claude"} or {"model": "gemini"}."""


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


def proxy_router():
  """Proxy가 시작할 때 만든 Router. 훅 import 시점에는 아직 없으므로 호출할 때 꺼낸다."""
  from litellm.proxy.proxy_server import llm_router

  return llm_router


def parse_choice(content: str | None) -> str:
  """판정 모델의 JSON 응답에서 고른 모델을 꺼낸다. 후보가 아니면 ValueError."""
  choice = json.loads(content or "").get("model")
  if choice not in CANDIDATES:
    raise ValueError(f"unknown model: {choice!r}")
  return choice


class AiRouter(CustomLogger):
  """판정 모델이 고른 별칭으로 data["model"]을 바꾼다. 판정이 실패하면 요청 그대로 둔다."""

  def __init__(self, get_router: Callable = proxy_router, timeout: float = JUDGE_TIMEOUT_SECONDS) -> None:
    super().__init__()
    self.get_router = get_router
    self.timeout = timeout

  async def judge(self, question: str) -> str:
    """판정 모델을 시간 제한 안에서 부른다. 실패하면 예외를 그대로 올린다."""
    response = await asyncio.wait_for(
      self.get_router().acompletion(
        model=JUDGE_MODEL,
        messages=[{"role": "system", "content": JUDGE_PROMPT}, {"role": "user", "content": question}],
        response_format={"type": "json_object"},
      ),
      timeout=self.timeout,
    )
    return parse_choice(response.choices[0].message.content)

  async def async_pre_call_hook(self, user_api_key_dict: UserAPIKeyAuth, cache, data: dict, call_type: str) -> dict:
    """판정 결과로 model을 바꾸고, 결과와 걸린 시간을 spend log에 남긴다."""
    requested = data.get("model")
    started = time.monotonic()
    try:
      data["model"] = await self.judge(last_user_text(data.get("messages", [])))
      decision = f"{requested}->{data['model']}"
    except Exception as error:  # noqa: BLE001 - timeout, 연결 실패, JSON 형식 오류 모두 요청 모델로 보낸다
      decision = f"{requested} kept ({type(error).__name__})"
    elapsed = time.monotonic() - started
    return add_spend_logs_metadata(data, {"ai_router": f"{decision} in {elapsed:.1f}s"})


ai_router = AiRouter()
