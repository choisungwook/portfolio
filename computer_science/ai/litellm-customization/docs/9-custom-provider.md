# 8단계. custom provider로 가짜 모델 뒤에 검색 붙이기

## 이번 단계에서 배울 개념

- `custom_provider_map`에 provider 이름과 `CustomLLM` 인스턴스를 등록하면, `model: gateway/search`처럼 그 provider 접두사를 가진 deployment 호출이 내 코드로 들어온다. 클라이언트에게 `gateway-search`는 그냥 모델 별칭 하나다.
- custom provider 안에서는 무엇이든 할 수 있다. 여기서는 검색을 먼저 하고, 검색 결과를 system 메시지로 붙여 Proxy의 Router로 실제 모델(`chat-small`)을 다시 부른다. 훅이 "요청을 고치는" 곳이라면 custom provider는 "응답을 만드는" 곳이다.
- 스트리밍(`astreaming`)에서는 `GenericStreamingChunk`를 yield한다. 검색이 끝나기 전에 첫 청크로 상태(`tool_calls`)를 먼저 보내면 사용자는 검색 지연 동안에도 무언가를 받는다. 이후 실제 모델의 스트림을 청크 단위로 중계한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| custom provider | LiteLLM이 내장하지 않은 provider를 코드로 붙이는 확장 지점 | provider 이름 `gateway` |
| CustomLLM | custom provider가 구현하는 기반 클래스. `acompletion`, `astreaming` 등을 가진다 | `GatewaySearchLLM` |
| GenericStreamingChunk | custom provider 스트림의 청크 형식(TypedDict). `text`, `tool_use`, `is_finished`, `finish_reason`, `usage` | `status_chunk`, `text_chunk` |
| 상태 청크 | 내용이 아니라 진행 상태를 알리는 첫 청크 | `tool_calls: web_search {"status": "searching"}` |
| TTFB (Time To First Byte) | 요청부터 첫 청크 도착까지의 시간 | 상태 청크 0.29초 |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | config의 `custom_provider_map` 항목마다 `custom_handler` 문자열을 인스턴스로 바꾼다 | `proxy/proxy_server.py` | `ProxyConfig.load_config` (`key == "custom_provider_map"` 분기) → `get_instance_fn` |
| 2 | provider 이름을 provider 목록과 `litellm._custom_providers`에 추가한다 | `utils.py` | `custom_llm_setup` |
| 3 | `model`의 접두사(`gateway`)가 custom provider면 그 handler로 분기한다 | `main.py` | `completion` → `_complete_custom_providers` |
| 4 | 비동기·스트림 여부로 `acompletion`, `astreaming` 중 하나를 고른다 | `llms/custom_llm.py` | `custom_chat_llm_router` |
| 5 | 스트림이면 `CustomStreamWrapper`로 감싸고, 청크의 `tool_use`를 `delta.tool_calls`로 바꾼다 | `litellm_core_utils/streaming_handler.py` | `CustomStreamWrapper._dispatch_provider_chunk` |
| 6 | 스트림 중 tool_calls가 한 번이라도 있었으면 마지막 `finish_reason`의 `stop`을 `tool_calls`로 바꾼다 | `litellm_core_utils/streaming_handler.py` | `CustomStreamWrapper._normalize_tool_call_finish_reason` |

2번에서 provider 이름이 내장 provider와 같으면 경고와 함께 내장 provider가 이긴다(`_warn_if_built_in_provider_shadows_custom_handler`). `openai` 같은 이름을 쓰면 내 코드가 호출되지 않는다.

6번은 실행해 보고서야 드러난 동작이다. 상태 청크를 `tool_calls`로 보내면 스트림 끝의 `finish_reason`이 `tool_calls`가 된다. 아래 "상태 청크를 tool_calls로 보낼 때의 대가"에서 다룬다.

## 코드와 config

[gateway/search_provider.py](../gateway/search_provider.py)는 검색 함수와 Router를 생성자에서 받는다. 8단계의 검색은 0.5초 쉬고 고정 문자열을 돌려주는 `fake_search`이고, 9단계에서 실제 검색 도구로 바꾼다.

```python
class GatewaySearchLLM(CustomLLM):
  async def acompletion(self, model, messages, *args, **kwargs) -> ModelResponse:
    answered_by, augmented = await self.prepare(messages)  # (답한 검색 도구, 검색 결과가 붙은 messages)
    return await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented)

  async def astreaming(self, model, messages, *args, **kwargs) -> AsyncIterator[GenericStreamingChunk]:
    query = last_user_text(messages)
    yield status_chunk(query)
    answered_by, augmented = await self.prepare(messages)  # (답한 검색 도구, 검색 결과가 붙은 messages)
    stream = await self.get_router().acompletion(model=ANSWER_MODEL, messages=augmented, stream=True)
    async for chunk in stream:
      yield text_chunk(chunk.choices[0].delta.content or "")
    yield text_chunk("", finished=True)
```

`CustomLLM`의 메서드 시그니처는 `api_base`, `logging_obj` 등 인자가 많지만 이 provider는 `model`과 `messages`만 쓰므로 나머지를 `*args, **kwargs`로 받는다. Router는 6단계에서 만든 `proxy_router()`로 꺼낸다. 실제 파일에는 `answered_by`를 spend log에 남기는 `record_from_provider` 호출이 한 줄씩 더 있다. 9단계에서 검색 도구가 여럿이 되면서 필요해진 기록이며 11단계에서 설명한다.

[config/8-custom-provider.yaml](../config/8-custom-provider.yaml)은 provider 등록, 가짜 모델 별칭, 7단계의 표식 훅을 함께 둔다.

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
  callbacks: ["gateway.feature_switch.feature_switch_to_search"]
```

`feature_switch_to_search`는 `tools: [{"type": "web_search"}]` 표식이 있는 요청을 `gateway-search`로 보낸다. 그래서 클라이언트는 `gateway-search`를 직접 부르거나, `chat-small`에 표식만 붙여 같은 기능을 쓸 수 있다.

## 실행

Postgres가 떠 있어야 한다([1-setup.md의 4번](1-setup.md)).

### 1. custom provider를 등록한 Proxy 기동

provider 등록, `gateway-search` 별칭, 표식 훅을 함께 둔 `config/8-custom-provider.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/8-custom-provider.yaml --port 4100
```

### 2. gateway-search 비스트리밍 직접 호출

먼저 표식 없이 `gateway-search` 별칭을 직접 불러, 클라이언트에게 custom provider가 모델 별칭 하나로 보이는지 확인한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "gateway-search", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}]}'
```

응답에서는 `message.content`와 본문의 `model` 필드를 본다.

```text
{"id":"chatcmpl-f1efc6bd-...","created":1794539946,"model":"gateway-search","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"검색 결과를 바탕으로 한 small 모델의 답변입니다.","role":"assistant"}}],"usage":{"completion_tokens":20,"prompt_tokens":10,"total_tokens":30}}
```

답변은 `chat-small`의 mock 응답이지만 본문 `model`은 클라이언트가 부른 `gateway-search`다.

### 3. 표식으로 스트리밍 호출하고 청크 도착 시각 측정

[scripts/stream_timing.py](../scripts/stream_timing.py)는 OpenAI SDK로 스트리밍을 받으며 청크마다 경과 시간을 출력한다. `--web-search`는 `tools: [{"type": "web_search"}]`를 붙인다. 표식을 붙여 `chat-small`을 스트리밍으로 부른다.

```bash
uv run python scripts/stream_timing.py chat-small "LiteLLM 최신 버전" --web-search
```

첫 청크로 상태(`tool_calls`)가 먼저 오고, 실제 답변 청크가 언제부터 이어지는지 경과 시간 열을 본다.

```text
 0.29s tool_calls web_search {"query": "LiteLLM 최신 버전", "status": "searching"}
 0.80s content  '검색 '
 0.80s content  '결과를'
 0.80s content  ' 바탕'
 ...
 0.80s content  '니다.'
 0.81s finish   tool_calls
```

같은 질문을 표식 없이 보내면 훅이 모델을 바꾸지 않아 `chat-small`이 바로 답한다.

```bash
uv run python scripts/stream_timing.py chat-small "LiteLLM 최신 버전"
```

이번에는 상태 청크 없이 첫 청크부터 답변 내용이 온다.

```text
 0.06s content  '검색 '
 0.06s content  '결과를'
 0.06s content  ' 바탕'
 ...
```

시간 값은 실행마다 조금씩 달라진다. 이 실행에서 상태 청크는 0.29초에 도착했고, 실제 답변은 가짜 검색 0.5초가 지난 0.80초부터 왔다. 상태 청크가 없었다면 사용자는 0.8초 동안 아무것도 받지 못한다. 또 표식 요청의 `finish_reason`이 `stop`이 아니라 `tool_calls`인 것은 위 표 6번의 동작 때문이다.

### 4. spend log의 요청 기록 확인

지금까지 보낸 세 요청이 spend log에 어떻게 남았는지 최근 세 행을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 3"
```

최신 행이 위에 온다. 3번의 표식 없는 `chat-small` 요청, 3번의 표식 요청, 2번의 `gateway-search` 직접 호출 순서다.

```text
chat-small|null
gateway-search|{"feature_switch": ["web_search"], "search_provider": "fake -> chat-small"}
gateway-search|{"search_provider": "fake -> chat-small"}
```

2번의 직접 호출은 표식이 없어 `feature_switch` 훅이 아무것도 남기지 않았고, 표식 요청에만 `feature_switch`가 있다. `search_provider`는 provider가 `record_from_provider`로 남긴 값으로(11단계에서 설명), 어느 검색이 답했고 어느 모델로 넘겼는지를 바깥 요청의 행에 남긴다. 반면 provider 안에서 부른 `chat-small` 호출은 행을 만들지 않고, spend log에는 바깥 요청(`gateway-search`)만 남는다. 6단계의 분류 모델 호출과 같은 동작이다. 실제 비용은 안쪽 호출에서 생기므로, 이 구조를 운영하면 비용이 `gateway-search` 행에 잡히지 않는 문제를 따로 풀어야 한다.

## 상태 청크를 tool_calls로 보낼 때의 대가

OpenAI 스트리밍 형식에는 "진행 상태"를 위한 필드가 없다. `tool_calls`는 클라이언트 UI가 이미 "도구 실행 중"으로 표시하는 필드라 상태를 싣기에 자연스럽지만, 의미가 겹친다는 대가가 있다.

| 문제 | 원인 | 대응 |
|---|---|---|
| `finish_reason`이 `tool_calls`로 끝난다 | `_normalize_tool_call_finish_reason`이 tool_calls를 본 스트림의 `stop`을 바꾼다 | 클라이언트가 이 gateway 기능을 알고 무시하게 하거나, 상태를 `tool_calls`가 아닌 곳에 싣는다 |
| tool loop를 도는 클라이언트가 `web_search`를 실행하려 한다 | 표준 클라이언트는 `finish_reason: tool_calls`를 "도구를 실행하고 결과를 다시 보내라"로 해석한다 | 함수 이름을 클라이언트 tool과 겹치지 않게 하고, 클라이언트에 등록되지 않은 함수는 무시하게 한다 |
| 비스트리밍에는 상태가 없다 | 응답을 한 번에 주므로 진행 상태를 보낼 시점이 없다 | 비스트리밍은 검색 지연이 그대로 응답 지연이 된다 |

`GenericStreamingChunk`의 `provider_specific_fields`에 상태를 싣는 방법도 있지만, OpenAI SDK의 표준 필드가 아니라서 클라이언트가 직접 꺼내 써야 한다. 어느 쪽이든 상태 청크는 gateway와 클라이언트 사이의 약속이며, 그 약속을 모르는 클라이언트에게는 노이즈가 된다.

## 단위 테스트

[tests/test_8_search_provider.py](../tests/test_8_search_provider.py)는 검색 함수와 Router를 모두 fake로 주입하고, 호출 순서를 `events` 목록에 기록한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_acompletion_calls_answer_model_with_search_context` | 비스트리밍이 검색 결과를 system 메시지로 붙여 `chat-small`을 부른다 |
| `test_astreaming_sends_status_before_search_then_relays` | 상태 청크가 검색보다 먼저 나가고, 이후 모델 청크가 순서대로 중계되며 마지막 청크가 종료를 알린다 |

두 테스트를 한 번에 실행한다.

```bash
uv run pytest tests/test_8_search_provider.py
```

마지막 줄의 `2 passed`로 두 테스트가 모두 통과했는지 본다.

```text
..                                                                       [100%]
2 passed
```

## 실험 과제

`status_chunk`의 `tool_use`를 `None`으로 바꾸고 대신 `provider_specific_fields={"gateway_status": "searching"}`를 넣어 본다. `scripts/stream_timing.py`를 다시 실행했을 때 첫 청크가 여전히 0.3초 근처에 오는지, 마지막 `finish_reason`이 `stop`으로 돌아오는지, 그리고 OpenAI SDK의 `chunk.choices[0].delta`에서 이 값을 꺼낼 수 있는지 확인한다.
