"""3단계: pre_call 훅이 spend_logs_metadata를 붙이고, callbacks 문자열이 인스턴스로 풀리는지 확인한다."""

from litellm.proxy._types import UserAPIKeyAuth
from litellm.proxy.types_utils.utils import get_instance_fn

from gateway.metadata_tagger import MetadataTagger, metadata_tagger


async def run_hook(data: dict) -> dict:
  return await MetadataTagger().async_pre_call_hook(
    user_api_key_dict=UserAPIKeyAuth(), cache=None, data=data, call_type="acompletion"
  )


async def test_hook_adds_spend_logs_metadata() -> None:
  data = await run_hook({"model": "chat-small", "messages": []})
  assert data["metadata"]["spend_logs_metadata"] == {"chatbot": "qa-bot", "tagged_by": "metadata_tagger"}


async def test_hook_keeps_client_spend_logs_metadata() -> None:
  data = await run_hook({"metadata": {"spend_logs_metadata": {"session": "s-1"}}})
  assert data["metadata"]["spend_logs_metadata"]["session"] == "s-1"


def test_callback_string_resolves_to_module_instance() -> None:
  instance = get_instance_fn("gateway.metadata_tagger.metadata_tagger", config_file_path="config/3-pre-call-hook.yaml")
  assert instance is metadata_tagger
