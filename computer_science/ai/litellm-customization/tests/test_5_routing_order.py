"""5단계: 훅 실행 순서에 따라 결과가 달라지고, 표식이 있으면 앞 훅의 결정이 유지되는지 확인한다."""

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth

from gateway.routing_order import (
  downgrade_hook,
  downgrade_hook_locking,
  upgrade_hook,
  upgrade_hook_locking,
)

CONFLICTING_QUESTION = "이 코드 고쳐줘"  # 키워드가 있으면서 20자 이하


async def run_chain(hooks: list[CustomLogger]) -> dict:
  """Proxy의 ProxyLogging.pre_call_hook처럼 앞 훅이 돌려준 data를 다음 훅에 넘긴다."""
  data = {"model": "chat-small", "messages": [{"role": "user", "content": CONFLICTING_QUESTION}]}
  for hook in hooks:
    data = await hook.async_pre_call_hook(
      user_api_key_dict=UserAPIKeyAuth(), cache=None, data=data, call_type="acompletion"
    )
  return data


async def test_last_hook_wins_without_lock() -> None:
  assert (await run_chain([upgrade_hook, downgrade_hook]))["model"] == "chat-small"
  assert (await run_chain([downgrade_hook, upgrade_hook]))["model"] == "chat-large"


async def test_lock_makes_first_decision_stick() -> None:
  data = await run_chain([upgrade_hook_locking, downgrade_hook_locking])
  assert data["model"] == "chat-large"
  assert data["metadata"]["spend_logs_metadata"]["downgrade_hook"] == "skip (locked by upgrade_hook)"


async def test_lock_follows_order_too() -> None:
  data = await run_chain([downgrade_hook_locking, upgrade_hook_locking])
  assert data["model"] == "chat-small"
