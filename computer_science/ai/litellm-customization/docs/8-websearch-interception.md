# 7단계. 내장 websearch_interception과 gateway 주도 검색 비교

## 이번 단계에서 배울 개념

- **모델 주도 검색 (`websearch_interception`)**: LiteLLM 내장 `websearch_interception` 콜백은 요청에 포함된 web search tool 정의를 `litellm_web_search` 함수 스키마로 변환해 모델에 전달한다. 모델이 응답으로 해당 tool 호출을 결정하면 LiteLLM이 서버 측에서 검색을 실행한 뒤 결과를 붙여 모델을 다시 호출한다. 클라이언트는 단 한 번의 요청으로 최종 답변만 수신한다.
- **gateway 주도 검색과의 비교**: 6단계에서 구현한 custom provider는 모델의 판단을 거치지 않고 gateway가 선제적으로 검색을 수행한 뒤 결과를 컨텍스트에 붙여 모델을 한 번만 호출하는 **gateway 주도** 방식이다.
- **결정 주체에 따른 아키텍처 차이**: 두 방식의 본질적 차이는 "검색 여부를 누가 결정하는가"이며, 이 차이가 지연 시간, 스트리밍 지원 여부, 비용 집계, 정확도에 서로 다른 영향을 미친다. 특히 내장 interception은 agentic loop 처리를 위해 `stream=True` 요청을 내부적으로 `stream=False`로 전환해 처리한다.

모델 주도 흐름을 외부 API 비용 없이 재현하기 위해 결정적인(deterministic) 동작을 하는 가짜 모델을 custom provider로 구현했다. [gateway/fake_tool_model.py](../gateway/fake_tool_model.py)는 `messages`에 tool 실행 결과가 없으면 `litellm_web_search` 호출을 요청하고, tool 결과가 들어 있으면 그 건수를 세어 최종 답변을 반환한다. 실제 LLM(vLLM 기반 Qwen)으로 동일한 interception을 검증한 사례는 [web-search-tool의 5-litellm-hands-on.md](../../web-search-tool/docs/5-litellm-hands-on.md)에서 확인할 수 있다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| `websearch_interception` | 모델의 web search tool 호출을 가로채 Proxy 서버에서 직접 실행하는 내장 콜백 | `callbacks: ["websearch_interception"]` |
| 모델 주도 방식 | 모델이 tool 호출 여부와 검색 질의어를 스스로 결정하는 패턴 | 가짜 모델이 `litellm_web_search` 호출 반환 |
| gateway 주도 방식 | gateway 코드가 검색 실행을 결정하고 모델은 결과만 받아 답하는 패턴 | 6단계 `gateway-search` |
| agentic loop | 모델 호출 → tool 실행 → 결과 첨부 후 모델 재호출을 반복하는 서버 측 루프 | interception 루프 1회 실행 |
| `litellm_web_search` | interception이 provider에 주입하는 표준 검색 tool 이름 | 가짜 모델 응답의 `function.name` |

## LiteLLM 내부 동작 위치

경로는 `site-packages/litellm/integrations/websearch_interception/` 기준이다.

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | 설정의 `"websearch_interception"` 문자열을 내장 콜백 인스턴스로 초기화한다 | `proxy/common_utils/callback_utils.py` | `initialize_callbacks_on_proxy` → `WebSearchInterceptionLogger.initialize_from_proxy_config` |
| 2 | 요청 `tools` 배열에서 web search tool(`type: web_search` 등)을 탐지한다 | `tools.py` | `is_chat_completion_request_web_search_tool` |
| 3 | provider 호출 직전 `stream=True`를 `stream=False`로 바꾸고 tool을 표준 function 형식으로 변환한다 | `handler.py` | `async_pre_call_deployment_hook`, `async_pre_request_hook` |
| 4 | 모델 응답에 `litellm_web_search` 호출이 포함되었는지 확인해 루프 진입 여부를 판단한다 | `handler.py` | `async_should_run_chat_completion_agentic_loop` |
| 5 | 검색을 실행하고 결과를 `tool` 메시지로 추가해 모델을 재호출한다 | `handler.py` | `async_run_chat_completion_agentic_loop` → `_execute_chat_completion_agentic_loop`, `_execute_search` |

이 기능은 `enabled_providers` 목록에 지정된 provider의 deployment에만 적용된다. 이 실습에서는 가짜 모델의 provider 이름인 `fakemodel`을 등록했다. 3번 동작 때문에 클라이언트가 스트리밍을 요청하더라도 provider 호출 자체는 비스트리밍으로 수행되며, agentic loop가 종료된 뒤 최종 응답만 SSE 스트림 형식으로 변환되어 클라이언트에 전달된다.

## 코드 및 설정

아래는 [config/7-websearch-interception.yaml](../config/7-websearch-interception.yaml)에서 가짜 모델, SearXNG 검색 도구, 그리고 내장 interception 콜백을 연결한 설정 부분이다.

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

## 실행 및 검증

이 단계를 실행하려면 Postgres와 로컬 mock 검색 서버가 모두 기동되어 있어야 한다([1-setup.md의 4·6번](1-setup.md#4-postgres-기동-3단계부터)).

### 1. Proxy 기동

가짜 모델과 내장 `websearch_interception` 콜백이 등록된 `config/7-websearch-interception.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/7-websearch-interception.yaml --port 4100
```

### 2. web search tool을 포함한 비스트리밍 호출

요청의 `tools` 필드에 `{"type": "web_search"}`를 담아 `chat-tool`을 호출하고, 응답 본문과 함께 HTTP 상태 코드 및 총 소요 시간을 출력한다.

```bash
curl -s -w "\n%{http_code} %{time_total}s\n" localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": [{"type": "web_search"}]}'
```

응답의 `finish_reason`과 `message.content`를 통해 클라이언트가 수신한 결과가 중간 tool 호출인지 최종 답변인지 확인한다.

```text
{"id":"chatcmpl-59a3ff34-...","model":"chat-tool","object":"chat.completion","choices":[{"finish_reason":"stop","index":0,"message":{"content":"검색 결과 1건을 근거로 답한 가짜 모델의 답변입니다.","role":"assistant"}}]}
200 0.341610s
```

가짜 모델은 첫 번째 호출에서 tool 호출을 반환했으나, 클라이언트는 그 중간 과정을 보지 못했다. LiteLLM이 해당 tool 호출을 가로채 mock 검색 서버에 질의한 뒤 결과를 붙여 모델을 재호출했기 때문에, 클라이언트에는 최종 답변만 전달되었다. 실제로 검색 요청이 실행되었다는 증거는 mock 검색 서버 터미널 로그(`GET /search?q=LiteLLM+%EC%B5%9C%EC%8B%A0+%EB%B2%84%EC%A0%84&format=json HTTP/1.1" 200`)에서 확인할 수 있으며, 쿼리 파라미터 `q`에는 모델이 tool 호출 인자로 생성한 검색어가 담긴다.

### 3. tools 없이 호출

interception이 요청의 web search tool 존재 여부를 기준으로 동작한다면, `tools`를 비우고 호출했을 때는 모델의 tool 호출 응답이 클라이언트에 그대로 노출되어야 한다.

```bash
curl -s localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": []}'
```

이번에는 `finish_reason`이 `tool_calls`이고 `message.tool_calls`에 `litellm_web_search` 호출이 그대로 담겨 오는지 확인한다.

```text
{"id":"chatcmpl-15ea2437-...","model":"chat-tool","object":"chat.completion","choices":[{"finish_reason":"tool_calls","index":0,"message":{"role":"assistant","tool_calls":[{"function":{"arguments":"{\"query\": \"LiteLLM 최신 버전\"}","name":"litellm_web_search"},"id":"call_4c561e111580","type":"function"}],"content":null}}]}
```

요청에 web search tool이 없으면 interception이 개입하지 않으므로 모델이 반환한 tool 호출이 클라이언트까지 그대로 전달된다. 다만 이 가짜 모델은 tool 정의가 없어도 무조건 호출을 생성하도록 구현되어 있을 뿐이며, 실제 LLM은 `tools` 정의가 없으면 tool 호출을 생성하지 않는 것이 일반적이다.

### 4. 스트리밍 호출 동작 확인

내부 동작 표 3번에서 확인한 대로 interception이 스트리밍을 비스트리밍으로 전환하는지 검증하기 위해, 2번 요청에 `"stream": true`를 추가해 호출한다.

```bash
curl -sN localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-tool", "stream": true, "messages": [{"role": "user", "content": "LiteLLM 최신 버전"}], "tools": [{"type": "web_search"}]}'
```

`delta.content`가 포함된 SSE 청크가 몇 개로 분할되어 오는지 확인한다.

```text
data: {"id":"chatcmpl-0694dcf0-...","object":"chat.completion.chunk","model":"chat-tool","choices":[{"index":0,"delta":{"role":"assistant","content":"검색 결과 1건을 근거로 답한 가짜 모델의 답변입니다."}}]}

data: {"id":"chatcmpl-0694dcf0-...","object":"chat.completion.chunk","model":"chat-tool","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

답변 전체가 단 하나의 청크로 전송되었다. 가짜 모델이 `astreaming`을 구현하지 않은 점도 있지만, 근본적으로 interception이 provider 호출을 비스트리밍으로 변환하기 때문에 실제 모델을 연결하더라도 agentic loop가 끝날 때까지 첫 토큰을 받을 수 없다. 반면 6단계의 gateway 주도 방식은 상태 청크를 즉시 전송하고 실제 모델 스트림을 토큰 단위로 중계할 수 있었다.

### 5. spend log 기록 비교

interception이 서버 내부에서 실행한 검색 호출이 spend log에 어떻게 남는지 확인하기 위해 `LiteLLM_SpendLogs`에서 최근 5개 행의 시각, `model_group`, `call_type`을 조회한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select to_char(\"startTime\",'HH24:MI:SS.MS'), model_group, call_type from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 5"
```

`call_type` 컬럼에서 `acompletion` 행 사이에 `asearch` 행이 별도로 기록되었는지 확인한다. 시각은 실행 시점에 따라 달라진다.

```text
03:29:24.650|chat-tool|acompletion
03:29:24.637|searxng-backup|asearch
03:29:15.835|chat-tool|acompletion
03:29:15.795|chat-tool|acompletion
03:29:15.708|searxng-backup|asearch
```

interception이 실행한 검색은 `asearch`라는 별도 행으로 적재된다. 4단계의 훅과 6단계의 custom provider가 내부에서 호출한 모델 요청이 spend log에 남지 않았던 것과 대비되며, 검색 API 호출 비용을 분리해 집계해야 하는 환경에서는 interception 방식이 유리하다. 참고로 DB의 `startTime`은 UTC 기준으로 저장되므로 로컬 시각과 시차가 있을 수 있다.

## 모델 주도 vs gateway 주도 Trade-off

| 관점 | 모델 주도 (내장 interception) | gateway 주도 (custom provider) |
| --- | --- | --- |
| 검색 여부 결정 | 모델이 질문을 보고 자율 판단 (불필요한 질문은 검색 생략) | 클라이언트가 선택한 모델 이름이 결정 (`gateway-search` 호출 시 항상 검색) |
| 검색어 생성 | 모델이 대화 맥락을 요약·변환해 검색어 생성 | 사용자 질문을 그대로 쓰거나 별도 전처리 로직 필요 |
| 모델 호출 횟수 | 최소 2회(판단 + 답변), 루프 반복 시 증가 | 1회(답변 생성) |
| 지연 시간 | 모델 호출 1회 + 검색 + 모델 호출 1회 | 검색 + 모델 호출 1회 |
| 스트리밍 지원 | 내부적으로 비스트리밍 처리 (루프 종료 시까지 첫 토큰 없음) | 상태 청크 선행 전송 후 토큰 단위 스트리밍 중계 가능 |
| 비용 추적 | 검색 호출이 별도 `asearch` spend log 행으로 기록됨 | 내부 호출이 기록되지 않아 별도 비용 집계 구현 필요 |
| 모델 요구사항 | 안정적인 tool calling 능력을 갖춘 모델 필요 | tool calling을 지원하지 않는 모델도 사용 가능 |
| 정확도 리스크 | 모델이 필요한 검색을 누락하거나 부정확한 검색어를 만들 수 있음 | 검색이 불필요한 질문에도 검색 결과가 붙어 답변 품질이 저하될 수 있음 |

두 방식 중 무엇을 선택할지는 질문 분포와 UX 요구사항에 달려 있다. 사용자가 UI에서 "웹 검색" 토글을 켠 요청처럼 검색 의도가 이미 확정된 경우에는 모델에게 재차 판단을 맡길 필요가 없으므로 gateway 주도 방식이 지연 시간과 비용 면에서 유리하다. 반대로 검색 필요 여부를 사전에 알 수 없는 일반 대화 환경에서는 모델 주도 방식이 불필요한 검색 호출을 줄여 준다. 클라이언트가 `gateway-search`처럼 모델 이름으로 검색 의사를 표현하는 구조라면 gateway 주도 방식과 잘 맞는다.

## 단위 테스트

[tests/test_7_fake_tool_model.py](../tests/test_7_fake_tool_model.py)는 가짜 모델의 두 분기 동작을 검증한다. interception 자체의 통합 동작은 위 실행 절차로 확인한다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_model_requests_search_when_no_tool_result` | tool 결과가 없으면 `finish_reason: tool_calls`와 `litellm_web_search` 호출을 반환함 |
| `test_model_answers_after_tool_result` | tool 결과가 있으면 그 개수를 포함한 최종 답변을 반환함 |

아래 명령으로 7단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_7_fake_tool_model.py
```

마지막 줄에서 두 테스트가 모두 통과했는지 확인한다.

```text
..                                                                       [100%]
2 passed
```

## 실험 과제

`FakeToolModel`이 tool 결과가 1개 있더라도 한 번 더 `litellm_web_search`를 요청하도록 수정해 본다(예: tool 메시지가 2개 미만이면 재호출). 이후 `config/7-websearch-interception.yaml`의 `websearch_interception_params`에 `max_agentic_loops: 1`을 추가해 실행했을 때 루프가 어느 지점에서 중단되는지, mock 검색 서버 로그와 spend log의 `asearch` 행이 몇 개 생성되는지 확인한다.
