# 6단계. custom provider로 가짜 모델 뒤에 검색 붙이기

## 이번 단계에서 배울 개념

- **`custom_provider_map`을 통한 가상 모델 구현**: `custom_provider_map`에 provider 이름과 `CustomLLM` 인스턴스를 등록하면, `model: gateway/search`처럼 해당 provider 접두사를 가진 deployment 호출이 사용자 정의 Python 코드로 라우팅된다. 클라이언트 관점에서는 `gateway-search`가 일반 모델 별칭과 동일하게 보인다.
- **응답 생성 파이프라인 제어**: pre_call 훅이 "요청을 가로채 수정하는" 지점이라면 custom provider는 "응답을 직접 생성하는" 지점이다. 여기서는 검색을 먼저 수행한 뒤 결과를 system 메시지로 덧붙여 Proxy Router의 실제 모델(`chat-small`)을 다시 호출한다.
- **스트리밍 상태 청크(`GenericStreamingChunk`)**: `astreaming` 메서드에서는 `GenericStreamingChunk`를 yield한다. 검색이 완료되기 전에 첫 청크로 진행 상태(`tool_calls`)를 먼저 전송하면, 사용자는 검색 지연 시간 동안에도 즉각적인 피드백을 받을 수 있다. 검색이 끝나면 실제 모델의 스트림을 청크 단위로 중계한다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| custom provider | LiteLLM이 기본 지원하지 않는 provider나 가상 파이프라인을 코드로 연결하는 확장 지점 | provider 이름 `gateway` |
| `CustomLLM` | custom provider가 상속하는 기반 클래스 (`acompletion`, `astreaming` 구현) | `GatewaySearchLLM` |
| `GenericStreamingChunk` | custom provider 스트림의 표준 청크 형식 (`TypedDict`: `text`, `tool_use`, `is_finished`, `finish_reason`, `usage`) | `status_chunk`, `text_chunk` |
| 상태 청크 | 답변 본문이 아니라 현재 진행 상태를 알리는 선행 청크 | `tool_calls: web_search {"status": "searching"}` |
| TTFB (Time To First Byte) | 요청 전송 후 첫 번째 응답 청크가 도착할 때까지의 시간 | 상태 청크 0.67초 |

## LiteLLM 내부 동작 위치

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | 설정의 `custom_provider_map` 항목마다 `custom_handler` 문자열을 인스턴스로 로드한다 | `proxy/proxy_server.py` | `ProxyConfig.load_config` (`key == "custom_provider_map"` 분기) → `get_instance_fn` |
| 2 | provider 이름을 지원 목록과 `litellm._custom_providers`에 등록한다 | `utils.py` | `custom_llm_setup` |
| 3 | `model` 접두사(`gateway`)가 custom provider에 해당하면 해당 handler로 분기한다 | `main.py` | `completion` → `_complete_custom_providers` |
| 4 | 비동기 및 스트리밍 여부에 따라 `acompletion` 또는 `astreaming`을 호출한다 | `llms/custom_llm.py` | `custom_chat_llm_router` |
| 5 | 스트리밍 응답을 `CustomStreamWrapper`로 감싸고, 청크의 `tool_use`를 `delta.tool_calls`로 변환한다 | `litellm_core_utils/streaming_handler.py` | `CustomStreamWrapper._dispatch_provider_chunk` |
| 6 | 스트림 도중 `tool_calls`가 한 번이라도 등장했으면 마지막 `finish_reason`의 `stop`을 `tool_calls`로 바꾼다 | `litellm_core_utils/streaming_handler.py` | `CustomStreamWrapper._normalize_tool_call_finish_reason` |

2번 단계에서 provider 이름이 LiteLLM 내장 provider와 겹치면 경고 로그가 남고 내장 provider가 우선 적용된다(`_warn_if_built_in_provider_shadows_custom_handler`). 예를 들어 `openai` 같은 이름을 사용하면 커스텀 코드가 호출되지 않는다.

6번 단계는 실제 실행 결과에서 확인되는 중요한 동작이다. 진행 상태를 알리기 위해 `tool_calls` 청크를 먼저 내보내면, 본문 스트리밍이 끝난 뒤에도 최종 `finish_reason`이 `stop`이 아닌 `tool_calls`로 변환된다. 이 부작용은 아래 "상태 청크를 tool_calls로 보낼 때의 고려사항" 절에서 자세히 다룬다.

## 코드 및 설정

[gateway/search_provider.py](../gateway/search_provider.py)는 검색 함수와 Router 조회 함수를 생성자에서 주입받는다. 여기서는 0.5초 대기 후 고정 문자열을 반환하는 `fake_search`를 사용하며, 실제 검색 도구 연동은 7단계의 `search_tools`에서 다룬다.

```python
class GatewaySearchLLM(CustomLLM):
  async def acompletion(self, model, messages, *args, **kwargs) -> ModelResponse:
    augmented = await self.prepare(messages)  # 검색 결과를 system 메시지로 붙인 messages
    return await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented)

  async def astreaming(self, model, messages, *args, **kwargs) -> AsyncIterator[GenericStreamingChunk]:
    query = last_user_text(messages)
    yield status_chunk(query)
    augmented = await self.prepare(messages)
    stream = await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented, stream=True)
    async for chunk in stream:
      yield text_chunk(chunk.choices[0].delta.content or "")
    yield text_chunk("", finished=True)
```

`CustomLLM` 메서드는 `api_base`, `logging_obj` 등 다수의 키워드 인자를 받지만 이 구현에서는 `model`과 `messages`만 사용하므로 나머지는 `*args, **kwargs`로 흘려보낸다. Router 객체는 4단계에서 작성한 `proxy_router()`를 통해 가져온다.

아래는 [config/6-custom-provider.yaml](../config/6-custom-provider.yaml)에서 `custom_provider_map` 등록과 가상 모델 별칭을 정의한 설정 부분이다.

```yaml
model_list:
  - model_name: chat-small
    litellm_params: { model: openai/mock-small, mock_response: "검색 결과를 바탕으로 한 small 모델의 답변입니다." }
  - model_name: gateway-search
    litellm_params:
      model: gateway/search

litellm_settings:
  custom_provider_map:
    - provider: gateway
      custom_handler: gateway.search_provider.gateway_search
```

클라이언트는 검색이 필요한 요청에는 `gateway-search`를, 일반 요청에는 `chat-small`을 호출한다. 즉 검색 수행 여부를 클라이언트가 모델 이름으로 명시하는 구조다.

## 실행 및 검증

이 단계를 실행하려면 Postgres([1-setup.md의 4번](1-setup.md#4-postgres-기동-3단계부터))가 기동되어 있어야 한다.

### 1. custom provider를 등록한 Proxy 기동

provider 등록과 `gateway-search` 별칭이 정의된 `config/6-custom-provider.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/6-custom-provider.yaml --port 4100
```

### 2. gateway-search 비스트리밍 호출

`gateway-search` 별칭을 호출해 클라이언트에게 custom provider가 일반 모델과 동일한 인터페이스로 동작하는지 확인한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "gateway-search", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}]}'
```

응답 본문에서 `message.content`와 `model` 필드를 확인한다.

```text
{"id":"chatcmpl-650f6a3e-...","created":1794585302,"model":"gateway-search","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"검색 결과를 바탕으로 한 small 모델의 답변입니다.","role":"assistant"}}],"usage":{"completion_tokens":20,"prompt_tokens":10,"total_tokens":30}}
```

실제 답변 내용은 내부에서 호출한 `chat-small`의 mock 응답이지만, 응답 본문의 `model` 필드는 클라이언트가 요청한 `gateway-search`로 반환된다.

### 3. 스트리밍 호출 및 청크 도착 시각 측정

[scripts/stream_timing.py](../scripts/stream_timing.py)는 OpenAI SDK로 스트리밍 응답을 수신하면서 각 청크의 경과 시간을 출력하는 스크립트다. 먼저 `gateway-search`를 스트리밍으로 호출한다.

```bash
uv run python scripts/stream_timing.py gateway-search "LiteLLM 최신 버전"
```

첫 청크로 상태(`tool_calls`)가 먼저 도착하고, 실제 답변 청크가 언제부터 이어지는지 경과 시간을 확인한다.

```text
 0.67s tool_calls web_search {"query": "LiteLLM 최신 버전", "status": "searching"}
 1.18s content  '검색 '
 1.18s content  '결과를'
 1.18s content  ' 바탕'
 ...
 1.18s content  '니다.'
 1.19s finish   tool_calls
```

대조군으로 같은 질문을 `chat-small`에 직접 스트리밍으로 요청한다.

```bash
uv run python scripts/stream_timing.py chat-small "LiteLLM 최신 버전"
```

이번에는 상태 청크 없이 첫 청크부터 바로 답변 텍스트가 출력된다.

```text
 0.07s content  '검색 '
 0.07s content  '결과를'
 0.07s content  ' 바탕'
 ...
```

소요 시간은 실행 환경마다 달라진다. 위 실행에서는 상태 청크가 0.67초에 먼저 도착했고, 실제 답변은 가짜 검색 지연(0.5초)이 지난 1.18초부터 수신되었다. 상태 청크가 없었다면 클라이언트는 1.2초 가까이 아무 데이터도 받지 못한 채 대기해야 한다. 또한 `gateway-search`의 최종 `finish_reason`이 `stop`이 아니라 `tool_calls`로 끝난 것은 내부 동작 표 6번에서 설명한 정규화 로직 때문이다.

### 4. spend log의 요청 기록 확인

방금 실행한 세 번의 요청이 spend log에 어떻게 기록되었는지 최근 3행의 `model_group`을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 3"
```

최신 행이 위쪽에 출력된다. 실행 순서대로 3번의 `chat-small` 직접 호출, 3번의 `gateway-search` 스트리밍, 2번의 `gateway-search` 비스트리밍에 해당한다.

```text
chat-small
gateway-search
gateway-search
```

custom provider 내부에서 Router를 통해 호출한 `chat-small`은 별도 spend log 행을 남기지 않고, 바깥쪽 요청(`gateway-search`)만 기록되었다. 4단계의 판정 모델 호출과 동일한 동작이다. 실제 토큰 비용은 안쪽 모델 호출에서 발생하므로, 이 패턴을 운영 환경에 적용할 때는 안쪽 호출의 비용을 바깥쪽 `gateway-search` 행에 합산하거나 별도로 추적하는 보완책이 필요하다.

## 상태 청크를 tool_calls로 보낼 때의 고려사항

OpenAI 스트리밍 스펙에는 "진행 상태"를 전달하기 위한 전용 필드가 없다. `tool_calls`는 기존 클라이언트 UI들이 이미 "도구 실행 중" 인디케이터로 렌더링하는 필드여서 상태를 싣기에 자연스럽지만, 표준 tool calling 의미와 충돌한다는 Trade-off가 따른다.

| 문제 | 원인 | 대응 방안 |
| --- | --- | --- |
| `finish_reason`이 `tool_calls`로 종료됨 | `_normalize_tool_call_finish_reason`이 `tool_calls`를 포함한 스트림의 `stop`을 덮어씀 | 클라이언트가 이 gateway 규약을 인지해 무시하거나, 상태를 `tool_calls` 외의 필드에 실음 |
| tool loop 클라이언트가 `web_search` 실행을 시도함 | 표준 에이전트 클라이언트는 `finish_reason: tool_calls`를 "도구 실행 후 재요청" 신호로 해석함 | 클라이언트 tool 이름과 겹치지 않게 네이밍하고, 미등록 함수 호출은 무시하도록 처리 |
| 비스트리밍 호출에는 상태 전달 불가 | 응답을 한 번에 반환하므로 중간 진행 상태를 보낼 시점이 없음 | 비스트리밍에서는 검색 지연이 그대로 응답 지연으로 반영됨 |

대안으로 `GenericStreamingChunk`의 `provider_specific_fields`에 상태 정보를 싣는 방법도 있지만, OpenAI SDK의 표준 필드가 아니어서 클라이언트 측에서 커스텀 파싱을 구현해야 한다. 어느 방식을 선택하든 진행 상태 청크는 gateway와 클라이언트 간의 사전 약속에 의존하며, 그 약속을 모르는 범용 클라이언트에게는 불필요한 노이즈로 보일 수 있다.

## 단위 테스트

[tests/test_6_search_provider.py](../tests/test_6_search_provider.py)는 검색 함수와 Router를 모두 fake 객체로 대체하고, 호출 순서를 `events` 리스트에 기록해 비동기 실행 흐름을 검증한다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_acompletion_calls_answer_model_with_search_context` | 비스트리밍 호출이 검색 결과를 system 메시지로 붙여 `chat-small`을 호출함 |
| `test_astreaming_sends_status_before_search_then_relays` | 상태 청크가 검색 실행보다 먼저 전송되고, 이후 모델 청크가 순차 중계되며 마지막 청크가 종료를 알림 |

아래 명령으로 6단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_6_search_provider.py
```

마지막 줄에서 두 테스트가 모두 통과했는지 확인한다.

```text
..                                                                       [100%]
2 passed
```

## 실험 과제

[gateway/search_provider.py](../gateway/search_provider.py)의 `status_chunk`에서 `tool_use`를 `None`으로 바꾸고 대신 `provider_specific_fields={"gateway_status": "searching"}`을 설정해 본다. `scripts/stream_timing.py`를 다시 실행했을 때 첫 청크가 여전히 검색 지연(0.5초)보다 먼저 도착하는지, 마지막 `finish_reason`이 `stop`으로 복구되는지, 그리고 OpenAI SDK의 `chunk.choices[0].delta` 객체에서 해당 커스텀 필드에 접근할 수 있는지 확인한다.
