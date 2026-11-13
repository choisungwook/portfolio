# 9단계. search_tools 검색 도구와 두 가지 폴백

## 이번 단계에서 배울 개념

- `search_tools`는 config에 검색 provider를 이름 붙여 등록하는 섹션이다. `model_list`가 LLM deployment를 등록하듯, `search_tool_name`마다 provider(`searxng`)와 접속 정보(`api_base`)를 묶는다. 등록한 도구는 Proxy의 `/v1/search/{search_tool_name}`과 Router의 `asearch`로 부를 수 있다.
- `litellm.asearch`는 provider와 접속 정보를 인자로 직접 받는 **모듈 함수**다. Router를 거치지 않으므로 `search_tools` 이름도, `router_settings.fallbacks`도 모른다. 1순위가 실패하면 그대로 예외가 난다.
- 폴백을 거는 방법은 둘이다. provider 코드가 도구 목록을 돌며 직접 다음 도구로 넘어가거나(**코드 폴백**), `router.asearch`에 첫 도구 이름만 주고 `router_settings.fallbacks`에 맡기는 것(**Router 폴백**)이다. Router 폴백은 LLM과 같은 retry·fallback 코드를 재사용한다.

8단계의 `fake_search`를 실제 검색 호출로 바꾼다. 비용과 외부 의존을 없애려고 SearXNG JSON API 형식만 흉내 내는 로컬 mock 서버([scripts/mock_searxng.py](../scripts/mock_searxng.py))를 쓴다. 실제 SearXNG를 띄우는 환경은 [web-search-tool](../../web-search-tool/)과 [searxng-production](../../searxng-production/) 핸즈온에 있고, `api_base`만 바꾸면 같은 코드로 붙는다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| search_tools | config에서 검색 도구를 이름으로 등록하는 최상위 섹션 | `searxng-primary`, `searxng-backup` |
| search_provider | LiteLLM이 내장한 검색 provider 이름 | `searxng` |
| litellm.asearch | provider를 직접 부르는 비동기 검색 함수 | `litellm.asearch(query=..., search_provider="searxng", api_base=...)` |
| router.asearch | `search_tool_name`으로 도구를 고르고 retry·fallback을 적용하는 Router 메서드 | `router.asearch(search_tool_name="searxng-primary", query=...)` |
| SearchResponse | 검색 결과의 공통 형식. `results[].title`, `url`, `snippet` | mock이 돌려준 결과 2개 |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | config의 `search_tools`를 읽어 `os.environ/` 값을 풀고 검증한다 | `proxy/proxy_server.py` | `ProxyConfig.parse_search_tools` |
| 2 | 검증된 목록이 Router 설정의 `search_tools`가 된다 | `router_python_core.py` | `PythonCore.__init__` (`_core_search_tools`) |
| 3 | `router.asearch`는 `asearch`를 감싼 factory 함수이고, call type이 `asearch`면 search 전용 fallback 경로로 간다 | `router_python_core.py` | `factory_function` → `_asearch_with_fallbacks` |
| 4 | `search_tool_name`을 `model` 자리에 넣어 LLM과 같은 fallback 루프를 돈다 | `router_utils/search_api_router.py` | `SearchAPIRouter.async_search_with_fallbacks` |
| 5 | 이름으로 도구 설정을 찾아 `litellm.asearch`를 부른다 | `router_utils/search_api_router.py` | `SearchAPIRouter.async_search_with_fallbacks_helper` |
| 6 | provider별 요청·응답을 변환해 HTTP로 호출한다 | `search/main.py`, `llms/searxng/search/transformation.py` | `asearch`, `SearXNGSearchConfig.transform_search_request` |
| 7 | Proxy endpoint `/v1/search/{search_tool_name}`도 Router를 거친다 | `proxy/search_endpoints/endpoints.py` | `search` |

직접 `litellm.asearch`를 부르면 6번부터 시작한다. 1~5번을 건너뛰므로 search_tools 이름 해석도, fallback 루프도 없다. 4번이 Router 폴백의 핵심으로, 검색 도구 이름을 model group 이름처럼 다루기 때문에 `router_settings.fallbacks`에 `searxng-primary: ["searxng-backup"]`을 쓰는 형식이 2단계의 LLM fallback과 같다.

## 코드와 config

[gateway/search_fallback.py](../gateway/search_fallback.py)에 두 방식을 함수로 둔다. 둘 다 `(snippet 목록, 답한 도구 이름)`을 돌려준다.

```python
async def search_with_code_fallback(query, order=SEARCH_ORDER, get_router=proxy_router):
  errors = []
  for name in order:
    try:
      response = await litellm.asearch(query=query, **search_tool_params(get_router(), name))
      return snippets(response), name
    except Exception as error:
      errors.append(f"{name}: {type(error).__name__}")
  raise SearchUnavailableError("; ".join(errors))


async def search_with_router_fallback(query, first=SEARCH_ORDER[0], get_router=proxy_router):
  response = await get_router().asearch(search_tool_name=first, query=query)
  answered_by = response._hidden_params.get("additional_headers", {}).get("x-litellm-model-group", first)
  return snippets(response), answered_by
```

코드 폴백도 접속 정보는 Router에 등록된 `search_tools`에서 이름으로 찾는다(`search_tool_params`). 도구 설정을 config 한 곳에만 두기 위해서다. Router 폴백에서 어느 도구가 답했는지는 2단계에서 본 `x-litellm-model-group` 값이 응답의 `_hidden_params`에 남는 것으로 알 수 있다.

[gateway/search_provider.py](../gateway/search_provider.py)는 8단계의 `GatewaySearchLLM`에 검색 함수만 바꿔 끼운 인스턴스 두 개를 더한다.

```python
gateway_search_code_fallback = GatewaySearchLLM(search=search_with_code_fallback)
gateway_search_router_fallback = GatewaySearchLLM(search=search_with_router_fallback)
```

config 두 개는 `search_tools`가 같고, Router 폴백 쪽에만 `router_settings.fallbacks`가 있다. 1순위 `api_base`는 아무것도 떠 있지 않은 8899 port라서 매번 연결에 실패한다.

```yaml
search_tools:
  - search_tool_name: searxng-primary
    litellm_params: { search_provider: searxng, api_base: http://localhost:8899 }
  - search_tool_name: searxng-backup
    litellm_params: { search_provider: searxng, api_base: http://localhost:8890 }

router_settings:            # config/9-search-router.yaml에만 있다
  fallbacks:
    - searxng-primary: ["searxng-backup"]
```

| config | custom_handler | router_settings.fallbacks |
|---|---|---|
| [config/9-search-code.yaml](../config/9-search-code.yaml) | `gateway_search_code_fallback` | 없음 |
| [config/9-search-router.yaml](../config/9-search-router.yaml) | `gateway_search_router_fallback` | 있음 |

## 실행

### 1. mock 검색 서버 기동

폴백이 넘어갈 2순위 도구로 쓸 mock 서버를 별도 터미널에서 띄운다. 이 서버는 8890 port에서 `/search?q=...&format=json`에 답한다.

```bash
uv run python scripts/mock_searxng.py
```

다른 터미널에서 SearXNG JSON 형식으로 응답이 오는지 직접 요청해 본다.

```bash
curl -s "localhost:8890/search?q=LiteLLM&format=json"
```

`results` 배열에 `title`, `url`, `content`를 가진 결과 2개가 오고, `content`의 `mock(8890)` 접두어로 어느 서버가 답했는지 구분할 수 있다.

```text
{"query": "LiteLLM", "results": [{"title": "LiteLLM 개요", "url": "http://mock-search.local:8890/1", "content": "mock(8890): LiteLLM의 정의와 배경"}, {"title": "LiteLLM 최신 소식", "url": "http://mock-search.local:8890/2", "content": "mock(8890): LiteLLM의 최근 변경 사항"}]}
```

### 2. 세 가지 호출 방식 비교

[scripts/compare_search_fallback.py](../scripts/compare_search_fallback.py)는 config의 `search_tools`와 `router_settings`로 Router를 만들고, 같은 질문을 세 방식으로 보낸다. Proxy는 띄우지 않는다. 먼저 `router_settings.fallbacks`가 있는 config로 실행한다.

```bash
uv run python scripts/compare_search_fallback.py config/9-search-router.yaml
```

각 줄에서 오류가 났는지, 성공했다면 어느 도구(`->` 앞의 이름)가 답했는지를 본다.

```text
1. litellm.asearch 직접: 오류 APIConnectionError
2. 코드 폴백: searxng-backup -> mock(8890): LiteLLM의 정의와 배경
3. Router 폴백: searxng-backup -> mock(8890): LiteLLM의 정의와 배경
```

모듈 함수만 실패하고 두 폴백은 모두 `searxng-backup`으로 넘어갔다. 이 차이가 config에서 오는지 코드에서 오는지 가르기 위해, 같은 스크립트를 fallbacks가 없는 config로 실행한다.

```bash
uv run python scripts/compare_search_fallback.py config/9-search-code.yaml
```

이번에는 3번 Router 폴백의 결과가 바뀌었는지 본다.

```text
1. litellm.asearch 직접: 오류 APIConnectionError
2. 코드 폴백: searxng-backup -> mock(8890): LiteLLM의 정의와 배경
3. Router 폴백: 오류 APIConnectionError
```

두 실행을 나란히 놓으면 폴백 순서가 어디에 있는지가 결과를 가른다. 1번은 모듈 함수가 Router 설정을 읽지 않으므로 config에 fallbacks가 있어도 실패한다. 2번은 폴백 순서가 코드(`SEARCH_ORDER`)에 있어서 config와 무관하게 동작한다. 3번은 폴백 순서가 config에 있으므로 `router_settings.fallbacks`가 있을 때만 백업으로 넘어간다.

### 3. Proxy endpoint로 Router 폴백 확인

스크립트에서 본 Router 폴백이 Proxy의 검색 endpoint에서도 같은 경로를 타는지 확인하려고, Postgres가 떠 있는 상태에서 Router 폴백 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/9-search-router.yaml --port 4100
```

1순위 도구 이름 `searxng-primary`로 검색 endpoint를 부르고, 응답 header 중 model group과 시도 횟수, 본문의 `results`만 골라 본다.

```bash
curl -s -D - localhost:4100/v1/search/searxng-primary \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"query": "LiteLLM"}' | grep -iE "x-litellm-(model-group|attempted)|results"
```

`x-litellm-model-group`이 어느 도구가 답했는지를, `x-litellm-attempted-fallbacks`가 폴백을 몇 번 거쳤는지를 알려 준다.

```text
x-litellm-model-group: searxng-backup
x-litellm-attempted-retries: 0
x-litellm-attempted-fallbacks: 1
{"results":[{"title":"LiteLLM 개요","url":"http://mock-search.local:8890/1","snippet":"mock(8890): LiteLLM의 정의와 배경", ...
```

클라이언트는 `searxng-primary`를 불렀지만 응답은 백업이 줬고, LLM과 같은 헤더로 그 사실이 드러난다. 1순위가 실패한 흔적은 Proxy 로그에 `Error in SearchAPIRouter.async_search_with_fallbacks_helper for searxng-primary: litellm.APIConnectionError`로 남는다.

같은 요청을 `config/9-search-code.yaml`로 띄운 Proxy에 보내면 `APIConnectionError`가 그대로 돌아온다. Proxy endpoint는 Router 폴백만 쓰기 때문이다.

### 4. custom provider에서 검색 후 답변

검색 endpoint에서 본 폴백이 custom provider 안에서도 동작하는지는 채팅 요청으로 확인한다. 두 config 모두 `gateway-search`로 부르면 백업 검색 결과를 붙여 `chat-small`이 답한다. 아래 명령은 응답 본문을 버리고 HTTP 상태 코드와 총 소요 시간만 출력한다.

```bash
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "gateway-search", "messages": [{"role": "user", "content": "LiteLLM"}]}'
```

두 config로 각각 띄운 Proxy에서 상태 코드가 200인지를 본다.

```text
code 폴백 config:   200 0.631989s
Router 폴백 config: 200 0.359319s
```

시간 값은 각 Proxy의 첫 요청이라 준비 시간이 섞여 있으므로, 방식 간 지연 차이로 해석하지 않는다. 또 어느 검색 도구가 답했는지는 응답 본문에 없다. 이 정보는 11단계에서 spend log에 남긴다.

## 코드 폴백과 Router 폴백 비교

| 관점 | 코드 폴백 | Router 폴백 |
|---|---|---|
| 폴백 순서가 사는 곳 | provider 코드 (`SEARCH_ORDER`) | config (`router_settings.fallbacks`) |
| 순서를 바꾸는 방법 | 코드 수정과 배포 | config 수정과 재시작 |
| retry, cooldown | 직접 구현해야 한다 | LLM과 같은 Router 기능을 쓴다 |
| Proxy `/v1/search` endpoint와의 일관성 | endpoint는 이 순서를 모른다 | endpoint와 provider가 같은 순서를 쓴다 |
| 실패 조건을 세밀하게 고르기 | 쉽다(결과가 0건이면 다음 도구 같은 조건) | 예외가 나야 넘어간다 |
| 어느 도구가 답했는지 | 반환값으로 바로 안다 | `_hidden_params`의 header 값을 꺼내야 한다 |

검색 결과가 비었을 때도 다음 도구로 넘기고 싶다면 코드 폴백이 맞다. Router는 예외만 실패로 보므로 200 응답에 결과 0건은 성공으로 끝난다. 반대로 검색 도구를 여러 서비스가 공유하고 Proxy endpoint로도 노출한다면, 폴백 정책을 config 한 곳에 두는 Router 폴백이 운영하기 쉽다.

## 단위 테스트

[tests/test_9_search_fallback.py](../tests/test_9_search_fallback.py)는 `litellm.asearch`를 monkeypatch로 바꾸고, `search_tools`와 `asearch`만 가진 `FakeRouter`를 주입한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_code_fallback_moves_to_next_tool` | 1순위가 연결 오류면 2순위 결과와 이름을 돌려준다 |
| `test_code_fallback_raises_when_every_tool_fails` | 모두 실패하면 두 도구의 오류를 담은 `SearchUnavailableError`를 던진다 |
| `test_router_fallback_reports_model_group_header` | Router 응답의 header 값에서 답한 도구를 꺼낸다 |

세 테스트는 `litellm.asearch`와 Router를 가짜로 바꾸므로 mock 서버나 Proxy 없이 pytest만으로 실행된다.

```bash
uv run pytest tests/test_9_search_fallback.py
```

마지막 줄의 통과 개수가 표의 테스트 수와 같은지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

[scripts/mock_searxng.py](../scripts/mock_searxng.py)를 8899 port로 하나 더 띄워(`uv run python scripts/mock_searxng.py 8899`) 1순위도 살린다. `compare_search_fallback.py`를 다시 실행하면 세 방식 모두 `mock(8899)` 결과를 돌려주는지 확인하고, 그 상태에서 8899 서버를 `Ctrl+C`로 끄는 순간 각 방식이 어떻게 반응하는지 비교한다.
