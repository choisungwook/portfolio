# 7단계. tools 표식으로 gateway 기능 켜기

## 이번 단계에서 배울 개념

- 클라이언트는 OpenAI 요청 형식 안에 "이 기능을 써 달라"는 표식을 실어 보낼 수 있다. 여기서는 `tools: [{"type": "web_search"}]`가 표식이다. 새 헤더나 별도 API 없이 기존 SDK 그대로 기능을 켤 수 있다는 것이 장점이다.
- 표식은 gateway와 클라이언트 사이의 약속일 뿐 provider가 아는 형식이 아니다. 훅이 표식을 해석해 `metadata`의 기능 플래그로 옮긴 뒤 `tools`에서 **지워야** 뒤쪽 훅과 provider가 모르는 tool 정의를 받지 않는다.
- 표식을 지울 때는 함께 의미를 잃는 필드도 정리한다. 남은 tool이 없는데 `tool_choice`만 남으면 OpenAI 호환 provider는 요청을 거절한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| 표식(marker) | 클라이언트가 기능을 요청하려고 요청 본문에 넣는 약속된 값 | `{"type": "web_search"}` |
| 기능 플래그 | 훅이 표식을 해석해 요청 metadata에 남긴 값. 뒤쪽 훅과 provider 코드가 읽는다 | `metadata.gateway_features = ["web_search"]` |
| function tool | 모델이 호출을 결정하는 일반 tool 정의. provider까지 그대로 가야 한다 | `{"type": "function", "function": {"name": "get_time", ...}}` |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | 요청 본문(`tools` 포함)이 그대로 pre_call 훅에 들어온다 | `proxy/utils.py` | `ProxyLogging.pre_call_hook` |
| 2 | 훅이 돌려준 dict가 다음 훅과 Router의 입력이 된다 | `proxy/utils.py` | `ProxyLogging.process_pre_call_hook_response` |
| 3 | LiteLLM 내장 websearch interception도 같은 모양의 tool을 web search로 인식한다 | `integrations/websearch_interception/tools.py` | `is_web_search_tool` 계열 함수 |

3번은 10단계와 연결된다. LiteLLM 내장 기능은 `type`이 `web_search`이거나 `web_search_`로 시작하는 tool을 web search tool로 인식한다. 이 핸즈온의 표식은 그 기능을 켜지 않은 상태에서 gateway 자체 코드가 먼저 가로채 해석하는 방식이다. 두 방식을 한 Proxy에서 함께 켜면 같은 표식을 두 곳이 해석하게 되므로 둘 중 하나만 써야 한다.

## 코드와 config

[gateway/feature_switch.py](../gateway/feature_switch.py)의 `FeatureSwitch`는 tools를 표식과 나머지로 나눈다.

```python
MARKER_TYPES = {"web_search"}
FEATURES_KEY = "gateway_features"


class FeatureSwitch(CustomLogger):
  async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
    features, remaining = split_markers(data.get("tools") or [])
    if not features:
      return data
    if remaining:
      data["tools"] = remaining
    else:
      data.pop("tools", None)
      data.pop("tool_choice", None)
    data.setdefault("metadata", {})[FEATURES_KEY] = features
    if self.target_model:
      data["model"] = self.target_model
    return add_spend_logs_metadata(data, {"feature_switch": features})
```

`target_model`은 8단계에서 쓴다. 기능이 켜진 요청을 custom provider 별칭(`gateway-search`)으로 보내는 인스턴스가 `feature_switch_to_search`다. 이번 단계의 `feature_switch`는 플래그만 켜고 모델은 그대로 둔다.

같은 모듈의 `ToolsAudit`는 관찰용 훅이다. 요청을 바꾸지 않고 자기 차례에 받은 tools의 `type` 목록만 spend log에 남긴다. 5단계에서 본 대로 콜백은 순서대로 실행되므로, `FeatureSwitch` 뒤에 두면 "다음 단계가 받는 요청"을 볼 수 있다.

| config | callbacks |
|---|---|
| [config/7-no-switch.yaml](../config/7-no-switch.yaml) | `tools_audit` |
| [config/7-feature-switch.yaml](../config/7-feature-switch.yaml) | `feature_switch` → `tools_audit` |

## 실행

Postgres가 떠 있어야 한다([1-setup.md의 4번](1-setup.md)).

### 1. 표식 해석 훅이 없는 Proxy 기동

비교 기준을 먼저 만든다. 관찰용 `tools_audit`만 등록한 `config/7-no-switch.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/7-no-switch.yaml --port 4100
```

### 2. 표식과 function tool을 함께 담은 요청 전송

`tools`에 표식 `{"type": "web_search"}`와 일반 function tool `get_time`을 함께 담아 보낸다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{
    "model": "chat-small",
    "messages": [{"role": "user", "content": "오늘 서울 날씨 알려줘"}],
    "tools": [
      {"type": "web_search"},
      {"type": "function", "function": {"name": "get_time", "parameters": {"type": "object", "properties": {}}}}
    ]
  }'
```

### 3. spend log로 다음 단계가 받은 tools 확인

응답 본문은 mock 응답이라 tools가 어떻게 처리됐는지 드러나지 않는다. 그래서 `tools_audit`이 spend log에 남긴 값을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 1"
```

`tools_seen_by_next_hook`에 표식과 function tool이 모두 남아 있다. 표식을 해석하는 훅이 없어 표식이 그대로 다음 단계로 넘어간 것이다.

```text
chat-small|{"tools_seen_by_next_hook": ["web_search", "function"]}
```

### 4. 표식 해석 훅 추가 후 결과 비교

이번에는 Proxy를 끄고 `feature_switch` → `tools_audit` 순서로 등록한 `config/7-feature-switch.yaml`로 띄운 뒤 2~3번을 반복한다. spend log에서 `feature_switch` 기록이 생겼는지, `tools_seen_by_next_hook` 목록이 어떻게 줄었는지 본다.

```text
chat-small|{"feature_switch": ["web_search"], "tools_seen_by_next_hook": ["function"]}
```

표식은 기능 플래그로 옮겨졌고, 뒤 훅은 function tool만 받았다. provider도 이와 같은 요청을 받는다. 반면 응답 본문은 두 경우 모두 mock 응답이라 같다. mock deployment는 tools를 검사하지 않으므로, 표식이 그대로 provider에 갔을 때의 오류는 이 실습에서 재현하지 않았다. 실제 OpenAI Chat Completions에 `{"type": "web_search"}`를 보내면 지원하지 않는 tool type으로 거절된다고 예상하지만 실행하지 않았다.

## 표식 방식을 쓸 때의 판단

표식을 요청 본문 안에 두면 클라이언트는 기존 OpenAI SDK의 `tools` 인자만 쓰면 되고, gateway는 같은 endpoint에서 기능을 켤 수 있다. 대신 표식이 provider 형식과 이름이 겹치면 문제가 생긴다. `web_search`는 OpenAI Responses API와 LiteLLM 내장 interception이 이미 쓰는 이름이라, gateway가 해석하지 않고 흘려보내면 의도와 다른 경로가 동작할 수 있다. 사내 전용 기능이라면 `x-gateway-web-search` 같은 충돌하지 않는 type을 쓰는 편이 안전하다. 이 핸즈온은 10단계에서 내장 interception과 비교하려고 같은 이름을 골랐다.

## 단위 테스트

[tests/test_7_feature_switch.py](../tests/test_7_feature_switch.py)는 훅을 직접 부른다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_marker_becomes_feature_flag_and_is_removed` | 표식은 플래그로 옮겨지고 function tool은 남는다 |
| `test_marker_only_request_drops_tools_and_tool_choice` | 표식만 있으면 `tools`와 `tool_choice`가 함께 지워지고 `target_model`로 바뀐다 |
| `test_request_without_marker_is_untouched` | 표식이 없으면 요청이 그대로다 |

세 테스트를 한 번에 실행한다.

```bash
uv run pytest tests/test_7_feature_switch.py
```

마지막 줄의 `3 passed`로 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`config/7-feature-switch.yaml`의 callbacks 순서를 `tools_audit` → `feature_switch`로 뒤집고 같은 요청을 보낸다. `tools_seen_by_next_hook`에 `web_search`가 다시 나타나는지 확인하고, 표식 해석 훅을 체인의 어디에 두어야 하는지 정리해 본다.
