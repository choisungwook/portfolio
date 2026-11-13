"""Router가 deployment를 몇 번, 어떤 순서로 호출하는지 콜백으로 기록한다.

Proxy 응답 헤더는 마지막으로 성공한 호출의 retry 횟수만 보여 준다. 이 스크립트는
config의 model_list와 router_settings로 Router를 직접 만들고, 성공과 실패 콜백을
모두 받아 시도 순서를 출력한다.

사용법: uv run python scripts/trace_router.py config/2-router.yaml chat-broken chat-large
"""

import asyncio
import sys

import litellm
import yaml
from litellm.integrations.custom_logger import CustomLogger


class AttemptRecorder(CustomLogger):
  """deployment 호출 결과를 (ok|fail, 모델) 순서대로 모은다."""

  def __init__(self) -> None:
    super().__init__()
    self.attempts: list[tuple[str, str]] = []

  async def async_log_success_event(self, kwargs, response_obj, start_time, end_time) -> None:
    self.attempts.append(("ok", kwargs.get("model", "")))

  async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time) -> None:
    self.attempts.append(("fail", kwargs.get("model", "")))


def build_router(config_path: str) -> litellm.Router:
  """config 파일의 model_list와 router_settings로 Router를 만든다."""
  with open(config_path) as f:
    config = yaml.safe_load(f)
  return litellm.Router(model_list=config["model_list"], **config.get("router_settings", {}))


async def trace(router: litellm.Router, recorder: AttemptRecorder, model: str) -> None:
  """별칭 하나를 호출하고 시도 순서와 최종 응답을 출력한다."""
  recorder.attempts.clear()
  try:
    response = await router.acompletion(model=model, messages=[{"role": "user", "content": "hi"}])
    result = response.choices[0].message.content
  except Exception as error:  # noqa: BLE001 - 관찰 도구라 어떤 오류든 이름만 출력한다
    result = f"오류 {type(error).__name__}"
  await asyncio.sleep(0.2)  # 로깅 콜백은 응답 뒤에 비동기로 실행된다
  print(f"{model} -> {result}")
  print(f"  시도: {recorder.attempts}")


async def main(config_path: str, models: list[str]) -> None:
  recorder = AttemptRecorder()
  litellm.callbacks = [recorder]
  router = build_router(config_path)
  for model in models:
    await trace(router, recorder, model)


if __name__ == "__main__":
  asyncio.run(main(sys.argv[1], sys.argv[2:]))
