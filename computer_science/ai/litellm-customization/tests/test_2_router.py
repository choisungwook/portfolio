"""2단계: load balancing, retries, fallbacks를 Router 단위에서 확인한다."""

import asyncio

import litellm
import pytest
from conftest import load_config
from trace_router import AttemptRecorder

MESSAGES = [{"role": "user", "content": "hi"}]
RECORDER = AttemptRecorder()  # 테스트마다 litellm.callbacks를 새로 넣으면 두 번째부터 반영되지 않아 한 번만 등록한다
litellm.callbacks = [RECORDER]


@pytest.fixture
def recorder() -> AttemptRecorder:
  RECORDER.attempts.clear()
  return RECORDER


def build_router() -> litellm.Router:
  config = load_config("2-router.yaml")
  return litellm.Router(model_list=config["model_list"], **config["router_settings"])


async def test_load_balancing_uses_both_deployments() -> None:
  router = build_router()
  answers = set()
  for _ in range(30):
    response = await router.acompletion(model="chat-small", messages=MESSAGES)
    answers.add(response.choices[0].message.content)
  assert answers == {"small-a deployment의 응답입니다.", "small-b deployment의 응답입니다."}


async def test_retries_exhaust_before_fallback(recorder: AttemptRecorder) -> None:
  response = await build_router().acompletion(model="chat-broken", messages=MESSAGES)
  await asyncio.sleep(0.2)
  assert response.choices[0].message.content.startswith("small-")
  assert [result for result, _ in recorder.attempts] == ["fail", "fail", "fail", "ok"]


async def test_without_fallbacks_error_reaches_client(recorder: AttemptRecorder) -> None:
  with pytest.raises(litellm.InternalServerError):
    await build_router().acompletion(model="chat-broken", messages=MESSAGES, disable_fallbacks=True)
  await asyncio.sleep(0.2)
  assert len(recorder.attempts) == 3
