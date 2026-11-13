"""3단계: 요청 metadata에 값을 추가해 spend log에 남기는 첫 pre_call 훅."""

from litellm.integrations.custom_logger import CustomLogger
from litellm.proxy._types import UserAPIKeyAuth


def add_spend_logs_metadata(data: dict, values: dict) -> dict:
  """요청 data의 metadata.spend_logs_metadata에 values를 합친다.

  Args:
    data: Proxy가 훅에 넘긴 요청 본문
    values: spend log에 남길 key-value

  Returns:
    같은 data 객체. 호출한 쪽이 그대로 돌려줄 수 있게 반환한다.
  """
  metadata = data.setdefault("metadata", {})
  metadata["spend_logs_metadata"] = {**(metadata.get("spend_logs_metadata") or {}), **values}
  return data


class MetadataTagger(CustomLogger):
  """모든 요청에 챗봇 이름과 훅 이름을 spend_logs_metadata로 붙인다."""

  async def async_pre_call_hook(
    self,
    user_api_key_dict: UserAPIKeyAuth,
    cache,
    data: dict,
    call_type: str,
  ) -> dict:
    """Proxy가 Router를 부르기 직전에 실행된다. 돌려준 dict가 다음 단계의 요청이 된다."""
    return add_spend_logs_metadata(data, {"chatbot": "qa-bot", "tagged_by": "metadata_tagger"})


metadata_tagger = MetadataTagger()
