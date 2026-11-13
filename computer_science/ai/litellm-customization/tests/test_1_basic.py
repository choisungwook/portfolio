"""1단계: mock 모델 2개가 provider 호출 없이 응답하는지 확인한다."""

import time

import litellm
from conftest import load_config


def build_router() -> litellm.Router:
  """1-basic.yaml의 model_list로 Proxy와 같은 Router를 만든다."""
  return litellm.Router(model_list=load_config("1-basic.yaml")["model_list"])


def test_config_registers_two_aliases() -> None:
  router = build_router()
  assert sorted(router.get_model_names()) == ["chat-large", "chat-small"]


async def test_alias_returns_its_mock_response() -> None:
  response = await build_router().acompletion(
    model="chat-small",
    messages=[{"role": "user", "content": "LiteLLM이 뭐야?"}],
  )
  assert response.choices[0].message.content == "small 모델의 mock 응답입니다."


async def test_mock_delay_slows_down_large_model() -> None:
  started = time.monotonic()
  await build_router().acompletion(
    model="chat-large",
    messages=[{"role": "user", "content": "hi"}],
  )
  assert time.monotonic() - started >= 1
