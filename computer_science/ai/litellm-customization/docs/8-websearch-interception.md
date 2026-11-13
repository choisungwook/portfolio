# 7단계. 내장 websearch_interception과 gateway 주도 검색 비교

## 이번 단계에서 배울 개념

- LiteLLM 내장 `websearch_interception`은 **모델 주도** 방식이다. 요청의 web search tool을 `litellm_web_search` function으로 바꿔 모델에 보내고, 모델이 그 tool 호출을 결정하면 LiteLLM이 검색을 실행한 뒤 결과를 붙여 모델을 다시 부른다. 클라이언트는 한 번 호출하고 최종 답변만 받는다.
- 6단계의 custom provider는 **gateway 주도** 방식이다. 모델에게 묻지 않고 gateway가 먼저 검색하고, 검색 결과를 붙여 모델을 한 번만 부른다.
- 두 방식의 차이는 "검색할지 누가 결정하는가"이며, 그 결정 주체가 지연, 스트리밍, 비용, 정확도를 각각 다르게 만든다. 실습에서 확인한 가장 큰 차이는 스트리밍이다. 내장 interception은 `stream=True`를 `stream=False`로 바꿔 처리한다.

모델 주도 흐름을 비용 없이 재현하려고 결정적인 가짜 모델을 custom provider로 만든다. [gateway/fake_tool_model.py](../gateway/fake_tool_model.py)는 messages에 tool 결과가 없으면 `litellm_web_search` 호출을 요청하고, 있으면 그 개수를 세어 답한다. 실제 모델(vLLM Qwen)로 같은 interception을 실행한 결과는 [web-search-tool의 5-litellm-hands-on.md](../../web-search-tool/docs/5-litellm-hands-on.md)에 있다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| websearch_interception | LiteLLM 내장 콜백. 모델의 web search tool 호출을 가로채 서버에서 실행한다 | `callbacks: ["websearch_interception"]` |
| 모델 주도 | 모델이 tool 호출 여부와 검색어를 정하는 방식 | 가짜 모델이 `litellm_web_search` 호출을 결정 |
| gateway 주도 | gateway 코드가 검색 여부를 정하고 모델은 결과만 받는 방식 | 6단계 `gateway-search` |
| agentic loop | 모델 호출 → tool 실행 → 모델 재호출을 반복하는 서버 측 루프 | interception이 1회 돌았다 |
| `litellm_web_search` | interception이 provider에 보내는 표준 검색 tool 이름 | 가짜 모델 응답의 `function.name` |

## LiteLLM 내부에서 일어나는 위치

경로는 `integrations/websearch_interception/` 기준이다.

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | config의 `"websearch_interception"` 문자열을 내장 콜백으로 만든다 | `proxy/common_utils/callback_utils.py` | `initialize_callbacks_on_proxy` → `WebSearchInterceptionLogger.initialize_from_proxy_config` |
| 2 | 요청 tools에서 web search tool(`type: web_search` 등)을 찾는다 | `tools.py` | `is_chat_completion_request_web_search_tool` |
| 3 | provider에 보내기 전 `stream=True`를 `stream=False`로 바꾸고 tool을 표준 형식으로 바꾼다 | `handler.py` | `async_pre_call_deployment_hook`, `async_pre_request_hook` |
| 4 | 모델 응답에 `litellm_web_search` 호출이 있는지 보고 루프를 돌지 정한다 | `handler.py` | `async_should_run_chat_completion_agentic_loop` |
| 5 | 검색을 실행하고 결과를 tool 메시지로 붙여 모델을 다시 부른다 | `handler.py` | `async_run_chat_completion_agentic_loop` → `_execute_chat_completion_agentic_loop`, `_execute_search` |

`enabled_providers`에 든 provider의 deployment에만 동작한다. 이 실습은 가짜 모델의 provider 이름 `fakemodel`을 넣었다. 3번 때문에 클라이언트가 스트리밍을 요청해도 provider는 비스트리밍으로 호출되고, 루프가 끝난 최종 응답이 스트림 형식으로 변환되어 나간다.

## 코드와 config

[config/7-websearch-interception.yaml](../config/7-websearch-interception.yaml)은 가짜 모델, 검색 도구 하나, 내장 콜백만 둔다.

```yaml
model_list:
  - model_name: chat-tool
    litellm_params:
      model: fakemodel/tool

search_tools:
  - search_tool_name: searxng-backup
    litellm_params: { search_provider: searxng, api_base: http://localhost:8890 }

litellm_settings:
  custom_provider_map:
    - provider: fakemodel
      custom_handler: gateway.fake_tool_model.fake_tool_model
  callbacks: ["websearch_interception"]
  websearch_interception_params:
    enabled_providers: ["fakemodel"]
    search_tool_name: searxng-backup
```

## 실행

Postgres와 mock 검색 서버가 떠 있어야 한다([1-setup.md의 4·6번](1-setup.md)).

### 1. Proxy 기동

가짜 모델과 내장 `websearch_interception` 콜백을 등록한 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/7-websearch-interception.yaml --port 4100
```

### 2. web search tool을 붙여 비스트리밍 호출

요청 `tools`에 `{"type": "web_search"}`를 붙여 `chat-tool`을 부르고, 응답 본문 뒤에 HTTP 상태 코드와 총 소요 시간을 함께 출력한다.

```bash
curl -s -w "\n%{http_code} %{time_total}s\n" localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": [{"type": "web_search"}]}'
```

응답의 `finish_reason`과 `message.content`를 보면 클라이언트가 받은 것이 tool 호출인지 최종 답변인지 알 수 있다.

```text
{"id":"chatcmpl-59a3ff34-...","model":"chat-tool","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"검색 결과 1건을 근거로 답한 가짜 모델의 답변입니다.","role":"assistant"}}]}
200 0.341610s
```

가짜 모델은 처음에 tool 호출을 돌려줬지만 클라이언트는 그것을 보지 못했다. LiteLLM이 그 호출을 가로채 검색을 실행하고 모델을 다시 불렀기 때문에, 클라이언트에는 그렇게 받은 최종 답변만 돌아왔다. 검색이 실제로 일어났다는 흔적은 mock 검색 서버 로그의 `GET /search?q=LiteLLM+%EC%B5%9C%EC%8B%A0+%EB%B2%84%EC%A0%84&format=json HTTP/1.1" 200`이며, 여기 담긴 검색어는 모델이 tool 호출 인자로 정한 값이다.

### 3. tools 없이 호출

interception이 요청의 web search tool을 보고 동작한다면, tool을 빼면 모델의 tool 호출이 그대로 드러나야 한다. 같은 질문을 `tools`를 빈 배열로 두고 보낸다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": []}'
```

이번에는 `finish_reason`이 `tool_calls`이고 `message.tool_calls`에 `litellm_web_search` 호출이 담겨 있는지 본다.

```text
{"id":"chatcmpl-15ea2437-...","model":"chat-tool","object":"chat.completion","choices":[{"finish_reason":"tool_calls","index":0,"message":{"role":"assistant","tool_calls":[{"function":{"arguments":"{\"query\": \"LiteLLM 최신 버전\"}","name":"litellm_web_search"},"id":"call_4c561e111580","type":"function"}],"content":null}}]}
```

요청에 web search tool이 없으면 interception이 동작하지 않으므로, 모델의 tool 호출이 클라이언트까지 그대로 온다. 다만 이 가짜 모델은 tool 정의가 없어도 호출을 만들 뿐이고, 실제 모델은 tools가 없으면 보통 호출하지 않는다.

### 4. 스트리밍으로 호출

내부 표 3번대로 interception이 스트리밍을 비스트리밍으로 바꾸는지 보려고, 2번과 같은 요청에 `"stream": true`만 더해 보낸다.

```bash
curl -sN localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "stream": true, "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": [{"type": "web_search"}]}'
```

`delta.content`가 담긴 청크가 몇 개로 나뉘어 오는지를 본다.

```text
data: {"id":"chatcmpl-0694dcf0-...","object":"chat.completion.chunk","model":"chat-tool","choices":[{"index":0,"delta":{"role":"assistant","content":"검색 결과 1건을 근거로 답한 가짜 모델의 답변입니다."}}]}

data: {"id":"chatcmpl-0694dcf0-...","object":"chat.completion.chunk","model":"chat-tool","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

답변 전체가 청크 하나로 왔다. 가짜 모델이 `astreaming`을 구현하지 않은 것도 원인일 수 있지만, 위 표 3번에서 interception이 provider 호출을 비스트리밍으로 바꾸므로 실제 모델이었어도 루프가 끝날 때까지 첫 토큰을 받을 수 없다. 6단계의 gateway 주도 방식은 상태 청크를 먼저 보내고 실제 모델 스트림을 토큰 단위로 중계했다.

### 5. spend log 비교

interception이 서버 안에서 실행한 검색이 비용 기록에 어떻게 남는지 보려고, `LiteLLM_SpendLogs`에서 최근 5개 행의 시각, model group, call type을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select to_char(\"startTime\",'HH24:MI:SS.MS'), model_group, call_type from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 5"
```

`call_type` 열에서 `acompletion` 행 사이에 `asearch` 행이 끼어 있는지 본다. 시각은 실행마다 달라진다.

```text
03:29:24.650|chat-tool|acompletion
03:29:24.637|searxng-backup|asearch
03:29:15.835|chat-tool|acompletion
03:29:15.795|chat-tool|acompletion
03:29:15.708|searxng-backup|asearch
```

interception이 실행한 검색은 `asearch` 행으로 따로 남는다. 4·6단계에서 훅과 provider가 안쪽에서 부른 호출이 행을 남기지 않았던 것과 다른 점이며, 그래서 검색 비용을 따로 집계하기에는 interception 쪽이 유리하다. 시각은 UTC로 저장되므로 로컬 시각과 다르게 보일 수 있다.

## 모델 주도와 gateway 주도의 Trade-off

| 관점 | 모델 주도 (내장 interception) | gateway 주도 (custom provider) |
|---|---|---|
| 검색 여부 결정 | 모델이 질문을 보고 정한다. 필요 없는 질문에는 검색하지 않는다 | 클라이언트가 고른 모델 이름이 정한다. `gateway-search`를 부르면 항상 검색한다 |
| 검색어 | 모델이 질문을 검색어로 바꾼다 | 사용자 질문을 그대로 쓰거나 별도 로직이 필요하다 |
| 모델 호출 횟수 | 최소 2번(결정 + 답변). 루프가 길면 더 늘어난다 | 1번(답변) |
| 지연 | 모델 호출 1번 + 검색 + 모델 호출 1번 | 검색 + 모델 호출 1번 |
| 스트리밍 | 내부적으로 비스트리밍. 루프가 끝날 때까지 첫 토큰이 없다 | 상태 청크를 먼저 보내고 토큰 단위로 중계할 수 있다 |
| 비용 기록 | 검색이 별도 spend log 행으로 남는다 | 안쪽 호출이 남지 않아 따로 기록해야 한다 |
| 모델 요구사항 | tool calling을 잘하는 모델이 필요하다 | tool calling을 못하는 모델도 쓸 수 있다 |
| 정확도 위험 | 모델이 검색이 필요한데 하지 않거나, 엉뚱한 검색어를 만들 수 있다 | 검색이 필요 없는 질문에도 검색 결과가 붙어 답을 흐릴 수 있다 |

정답은 질문의 분포와 UX 요구에 따라 다르다. "검색 버튼을 누른 질문"처럼 사용자가 이미 검색을 원한다고 표시했다면 모델에게 다시 물을 이유가 없으므로 gateway 주도가 지연과 비용 모두 유리하다. 반대로 검색이 필요한지 미리 알 수 없는 일반 대화에서는 모델 주도가 불필요한 검색을 줄인다. 클라이언트가 `gateway-search`처럼 모델 이름으로 검색 의사를 밝히는 구조라면 gateway 주도와 잘 맞는다.

## 단위 테스트

[tests/test_7_fake_tool_model.py](../tests/test_7_fake_tool_model.py)는 가짜 모델의 두 갈래를 확인한다. interception 자체의 동작은 테스트가 아니라 위 실행 절차로 검증한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_model_requests_search_when_no_tool_result` | tool 결과가 없으면 `finish_reason: tool_calls`와 `litellm_web_search` 호출을 돌려준다 |
| `test_model_answers_after_tool_result` | tool 결과가 있으면 그 개수를 담은 최종 답변을 돌려준다 |

위 표의 두 테스트를 pytest로 실행한다.

```bash
uv run pytest tests/test_7_fake_tool_model.py
```

마지막 줄의 통과 개수가 표의 테스트 수와 같은지 본다.

```text
..                                                                       [100%]
2 passed
```

## 실험 과제

`FakeToolModel`이 tool 결과가 있어도 한 번 더 `litellm_web_search`를 요청하게 바꾼다(예: tool 메시지가 2개 미만이면 다시 호출). config의 `websearch_interception_params`에 `max_agentic_loops: 1`을 넣고 실행했을 때 루프가 어디서 멈추는지, mock 검색 서버 로그와 spend log의 `asearch` 행이 몇 개 생기는지 확인한다.
