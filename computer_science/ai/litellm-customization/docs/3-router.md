# 2단계. Router의 load balancing, retries, fallbacks 내부 동작

## 이번 단계에서 배울 개념

- 같은 `model_name`에 deployment를 여러 개 등록하면 Router가 요청마다 하나를 고른다. 기본 전략 `simple-shuffle`은 weight·rpm·tpm이 없으면 무작위로 고른다.
- retry는 **같은 별칭 안에서** deployment를 다시 고르는 것이고, fallback은 retry가 모두 실패한 뒤 **다른 별칭**으로 넘어가는 것이다. 순서는 항상 retry가 먼저다.
- 500처럼 재시도할 만한 오류에서는 방금 실패한 deployment를 다음 시도에서 제외하지 않는다. 그래서 정상 deployment가 있어도 운이 나쁘면 retry가 모두 같은 고장 난 deployment로 가서 실패한다.

별칭과 fallback의 개념은 [LiteLLM 핸즈온의 3-routing.md](../../litellm/docs/3-routing.md)에서 다뤘다. 이 문서는 그 동작이 Router 코드의 어디에서 일어나고, 응답 헤더만 보면 무엇을 놓치는지에 집중한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| model group | 같은 `model_name`을 가진 deployment 묶음 | `chat-small`(deployment 2개) |
| routing strategy | group 안에서 deployment를 고르는 규칙 | `simple-shuffle` |
| num_retries | 첫 시도가 실패한 뒤 같은 group에서 더 시도하는 횟수 | `2` (최대 3번 호출) |
| fallbacks | group이 retry까지 실패하면 넘어갈 다른 group 목록 | `chat-broken → chat-small` |
| cooldown | 실패가 쌓인 deployment를 잠시 후보에서 빼는 것 | 이 실습에서는 일어나지 않음(아래 설명) |

## LiteLLM 내부에서 일어나는 위치

LiteLLM 1.109.1에서 `litellm/router.py`는 껍데기만 남았고 로직은 `router_python_core.py`의 `PythonCore`로 옮겨졌다. 아래 경로는 `site-packages/litellm/` 기준이다.

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | Proxy가 요청을 Router로 넘긴다 | `proxy/route_llm_request.py` | `route_request` |
| 2 | 진입점. 실제 호출 함수(`_acompletion`)를 kwargs에 싣고 fallback 래퍼를 부른다 | `router_python_core.py` | `PythonCore.acompletion` |
| 3 | retry 래퍼를 부르고, 예외가 나면 `fallbacks`에서 다음 group을 찾는다 | `router_python_core.py` | `async_function_with_fallbacks` |
| 4 | 첫 시도 후 실패하면 `num_retries`만큼 다시 부른다 | `router_python_core.py` | `async_function_with_retries` |
| 5 | 이 오류를 retry할지 정한다. 404, 컨텍스트 초과, 정상 deployment 0개면 retry 없이 던진다 | `router_python_core.py` | `should_retry_this_error` |
| 6 | 재시도 때 제외할 deployment를 정한다. 재시도 가능한 상태 코드면 아무것도 제외하지 않는다 | `router_python_core.py` | `_deployment_ids_to_skip_on_retry` |
| 7 | group 안에서 deployment 하나를 고른다 | `router_strategy/simple_shuffle.py` | `simple_shuffle` (`random.choices`) |
| 8 | 응답에 `x-litellm-attempted-retries`, `x-litellm-attempted-fallbacks` 헤더를 붙인다 | `router_python_core.py` | `add_retry_headers_to_response`, `add_fallback_headers_to_response` |

6번이 이번 단계에서 가장 중요한 지점이다. `_deployment_ids_to_skip_on_retry`는 실패한 deployment의 상태 코드가 `utils.py`의 `should_retry`(408, 409, 429, 5xx)에 해당하면 빈 tuple을 돌려준다. 일시적 장애라면 같은 deployment가 곧 회복할 수 있다고 보기 때문이다. 반대로 400처럼 다시 보내도 같은 답이 나올 오류만 그 deployment를 건너뛴다.

## 코드와 config

[config/2-router.yaml](../config/2-router.yaml)은 별칭 3개로 세 가지 동작을 나눠 관찰한다. 일부러 실패하는 deployment는 1단계 실험 과제에서 본 특수 문자열 `litellm.InternalServerError`로 만든다.

```yaml
model_list:
  - model_name: chat-small            # load balancing: deployment 2개
    litellm_params: { model: openai/mock-small-a, mock_response: "small-a deployment의 응답입니다." }
  - model_name: chat-small
    litellm_params: { model: openai/mock-small-b, mock_response: "small-b deployment의 응답입니다." }
  - model_name: chat-large            # retries: 고장 1개 + 정상 1개
    litellm_params: { model: openai/mock-large-broken, mock_response: "litellm.InternalServerError" }
  - model_name: chat-large
    litellm_params: { model: openai/mock-large-ok, mock_response: "large-ok deployment의 응답입니다." }
  - model_name: chat-broken           # fallbacks: 정상 deployment 없음
    litellm_params: { model: openai/mock-broken, mock_response: "litellm.InternalServerError" }

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 2
  retry_after: 0
  fallbacks:
    - chat-broken: ["chat-small"]
```

실제 파일은 flow style 대신 블록 style로 쓰여 있다. 내용은 같다.

응답 헤더는 마지막에 성공한 호출 기준이라 그 앞의 실패가 보이지 않는다. 그래서 Router를 직접 만들고 성공·실패 콜백으로 시도 순서를 기록하는 [scripts/trace_router.py](../scripts/trace_router.py)를 함께 쓴다. 콜백(`CustomLogger`)은 3단계에서 본격적으로 다루고, 여기서는 관찰 도구로만 쓴다.

## 실행

### 1. Proxy 기동

load balancing, retry, fallback을 별칭 3개로 나눠 둔 `config/2-router.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/2-router.yaml --port 4100
```

### 2. load balancing 분포 확인

deployment 2개가 등록된 `chat-small`을 20번 호출하고, 응답 내용으로 어느 deployment가 답했는지 센다.

```bash
for i in $(seq 20); do
  curl -s localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
done | sort | uniq -c
```

각 줄 앞의 숫자가 deployment별 응답 횟수다.

```text
   8 small-a deployment의 응답입니다.
  12 small-b deployment의 응답입니다.
```

`simple-shuffle`은 무작위로 고르므로 비율은 실행마다 달라지고, 정확히 10:10이 아니어도 정상이다.

### 3. retry 관찰

다음은 고장 난 deployment와 정상 deployment가 하나씩 묶인 `chat-large`다. 아래 명령을 여러 번 실행하면서 응답 헤더의 `x-litellm-model-name`과 `x-litellm-attempted-retries`를 본다.

```bash
curl -s -D - -o /dev/null localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-large", "messages": [{"role": "user", "content": "hi"}]}' \
  | grep -iE "x-litellm-(model-name|attempted)"
```

6번 호출해 상태 코드와 두 헤더를 정리하면 다음과 같다.

| 호출 | 결과 | model-name | attempted-retries |
|---|---|---|---|
| 1 | 200 | `openai/mock-large-ok` | 1 |
| 2 | 200 | `openai/mock-large-ok` | 1 |
| 3 | 200 | `openai/mock-large-ok` | 0 |
| 4 | **500** | `openai/mock-large-broken` | (헤더 없음) |
| 5 | 200 | `openai/mock-large-ok` | 2 |
| 6 | 200 | `openai/mock-large-ok` | 1 |

4번째 호출은 정상 deployment가 있는데도 실패했다. 첫 시도와 retry 2번이 모두 `mock-large-broken`으로 갔기 때문이다. 고장 난 deployment가 절반이면 세 번 연속으로 걸릴 확률은 1/8이다. 이때 클라이언트가 받은 오류 본문에는 `chat-large`에 fallback이 설정되어 있지 않아 다른 모델로 넘어가지 않았다는 안내가 붙는다.

```text
litellm.InternalServerError: this is a mock internal server error

LiteLLM: model group 'chat-large' failed with the error above and no fallback model group was found for it, so the request was not retried on another model. Fallbacks are configured for: chat-broken. ...
```

### 4. fallback 관찰

retry만으로 끝나지 않는 경우를 보려면 정상 deployment가 하나도 없는 `chat-broken`을 부른다. 이 별칭에는 `chat-small`로 가는 fallback이 걸려 있으므로, 아래 명령은 헤더와 함께 본문의 `model` 필드도 출력한다.

```bash
curl -s -D - localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-broken", "messages": [{"role": "user", "content": "hi"}]}' \
  | grep -iE "x-litellm-(model-name|attempted)|\"model\""
```

`x-litellm-attempted-fallbacks`와 본문 `model` 값을 본다.

```text
x-litellm-model-name: openai/mock-small-b
x-litellm-attempted-retries: 0
x-litellm-attempted-fallbacks: 1
{"id":"chatcmpl-...","model":"mock-small-b", ... "content":"small-b deployment의 응답입니다." ...}
```

본문 `model`이 요청한 별칭 `chat-broken`이 아니라 `mock-small-b`다. 1단계에서 본 `_override_openai_response_model`은 fallback이 일어났으면 실제 모델을 그대로 두기 때문이다. 헤더의 `attempted-retries: 0`도 오해하기 쉽다. 이 값은 fallback 대상인 `chat-small`의 retry 횟수이고, `chat-broken`에서 몇 번 실패했는지는 헤더에 남지 않는다.

### 5. 헤더가 감춘 시도 순서 확인

헤더에 남지 않는 `chat-broken`의 실패 횟수를 보려면 시도 순서를 직접 기록해야 한다. Proxy를 끄고, 같은 config로 Router를 직접 만드는 `scripts/trace_router.py`로 `chat-broken`을 1번, `chat-large`를 3번 호출한다.

```bash
uv run python scripts/trace_router.py config/2-router.yaml chat-broken chat-large chat-large chat-large
```

`시도:` 줄에서 실패(`fail`)와 성공(`ok`)이 어느 deployment에서 몇 번 일어났는지 본다.

```text
chat-broken -> small-b deployment의 응답입니다.
  시도: [('fail', 'mock-broken'), ('fail', 'mock-broken'), ('fail', 'mock-broken'), ('ok', 'mock-small-b')]
chat-large -> large-ok deployment의 응답입니다.
  시도: [('fail', 'mock-large-broken'), ('ok', 'mock-large-ok')]
chat-large -> large-ok deployment의 응답입니다.
  시도: [('ok', 'mock-large-ok')]
chat-large -> large-ok deployment의 응답입니다.
  시도: [('fail', 'mock-large-broken'), ('fail', 'mock-large-broken'), ('ok', 'mock-large-ok')]
```

`chat-broken`은 첫 시도와 retry 2번을 합해 3번 실패한 뒤에야 fallback으로 넘어갔다. 앞 단계에서 헤더가 보여 준 `attempted-retries: 0`과는 다른 값이다. 세 번째 `chat-large`는 고장 난 deployment를 연속 두 번 골랐는데, 이것이 재시도할 때 실패한 deployment를 제외하지 않는다는 위 표 6번의 증거다.

## 동작을 설계할 때의 판단

retry와 fallback은 지연을 비용으로 낸다. 실제 provider라면 `chat-broken`의 세 번 실패가 각각 timeout까지 기다린 뒤라서, 사용자는 fallback 응답을 받기 전에 timeout × 3만큼 기다린다. 장애가 명확한 deployment를 빨리 빼고 싶으면 retry를 늘리는 대신 `allowed_fails`와 `cooldown_time`으로 cooldown을 켜는 쪽이 맞다. 이 실습에서 cooldown이 일어나지 않은 이유는 로그의 `Cooldown Deployments=[]`로 확인했지만, 어느 조건 때문인지는 이번 단계에서 추적하지 않았다.

## 단위 테스트

[tests/test_2_router.py](../tests/test_2_router.py)는 Proxy 없이 Router만 쓴다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_load_balancing_uses_both_deployments` | 30번 호출하면 deployment 2개가 모두 답한다 |
| `test_retries_exhaust_before_fallback` | fallback 전에 실패가 정확히 3번(첫 시도 + retry 2) 일어난다 |
| `test_without_fallbacks_error_reaches_client` | `disable_fallbacks=True`면 3번 실패 후 오류가 그대로 올라온다 |

아래 명령은 이 테스트 파일만 실행한다.

```bash
uv run pytest tests/test_2_router.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`chat-large`에 `allowed_fails: 1`과 `cooldown_time: 30`을 `router_settings`에 추가하고 `scripts/trace_router.py`로 `chat-large`를 10번 연속 호출해 본다. cooldown이 켜지면 고장 난 deployment가 한 번 실패한 뒤 30초 동안 후보에서 빠지므로, 이후 시도 목록에서 `mock-large-broken`이 사라지는지 확인한다. 사라지지 않으면 `router_utils/cooldown_handlers.py`에서 cooldown을 건너뛰는 조건을 찾아본다.
