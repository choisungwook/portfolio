# 2단계. Router의 load balancing, retries, fallbacks 내부 동작

## 이번 단계에서 배울 개념

- **Model group과 load balancing**: 동일한 `model_name` 아래에 deployment를 여러 개 등록하면 Router가 요청마다 하나를 선택한다. 기본 전략인 `simple-shuffle`은 weight·rpm·tpm 설정이 없을 때 무작위로 deployment를 고른다.
- **Retry와 Fallback의 실행 순서**: retry는 **같은 별칭(model group) 내부에서** deployment를 다시 선택해 재시도하는 것이고, fallback은 retry가 모두 소진된 뒤 **다른 별칭**으로 요청을 넘기는 것이다. 따라서 항상 retry가 먼저 끝난 뒤에야 fallback이 동작한다.
- **재시도 시 deployment 제외 여부**: 500 Internal Server Error처럼 일시적 장애로 분류되는 오류에서는 직전에 실패한 deployment를 다음 retry 후보에서 제외하지 않는다. 그 결과 정상 deployment가 함께 묶여 있더라도 확률적으로 모든 retry가 고장 난 deployment로 라우팅되어 요청이 실패할 수 있다.

별칭과 fallback의 기본 개념은 [LiteLLM 핸즈온의 3-routing.md](../../litellm/docs/3-routing.md)에서 다뤘다. 이 문서는 해당 동작이 Router 내부 코드의 어느 지점에서 실행되는지, 그리고 응답 헤더만 확인했을 때 어떤 정보가 가려지는지에 집중한다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| model group | 동일한 `model_name`을 공유하는 deployment 집합 | `chat-small` (deployment 2개) |
| routing strategy | model group 내부에서 deployment를 선택하는 전략 | `simple-shuffle` |
| `num_retries` | 첫 시도가 실패한 뒤 같은 group 내에서 추가로 재시도하는 횟수 | `2` (최초 시도 포함 최대 3회 호출) |
| `fallbacks` | 특정 group이 retry까지 모두 실패했을 때 전환할 대체 group 목록 | `chat-broken → chat-small` |
| cooldown | 실패가 누적된 deployment를 일정 시간 후보에서 격리하는 기능 | 이 실습에서는 발동하지 않음 |

## LiteLLM 내부 동작 위치

LiteLLM 1.109.1에서는 `litellm/router.py`에 껍데기만 남고 핵심 라우팅 로직이 `router_python_core.py`의 `PythonCore`로 이동했다. 아래 경로는 `site-packages/litellm/` 기준 상대 경로다.

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | Proxy가 요청을 Router로 전달한다 | `proxy/route_llm_request.py` | `route_request` |
| 2 | 진입점: 실제 호출 함수(`_acompletion`)를 kwargs에 담아 fallback 래퍼를 호출한다 | `router_python_core.py` | `PythonCore.acompletion` |
| 3 | retry 래퍼를 호출하고, 최종 예외 발생 시 `fallbacks`에서 다음 group을 찾는다 | `router_python_core.py` | `async_function_with_fallbacks` |
| 4 | 첫 시도 실패 시 `num_retries`만큼 재호출한다 | `router_python_core.py` | `async_function_with_retries` |
| 5 | 오류 유형별 재시도 여부를 결정한다 (404, 컨텍스트 초과, 정상 deployment 0개면 즉시 예외 전달) | `router_python_core.py` | `should_retry_this_error` |
| 6 | 재시도 시 건너뛸 deployment 목록을 반환한다 (재시도 가능한 상태 코드면 빈 tuple 반환) | `router_python_core.py` | `_deployment_ids_to_skip_on_retry` |
| 7 | group 내에서 deployment 하나를 선택한다 | `router_strategy/simple_shuffle.py` | `simple_shuffle` (`random.choices`) |
| 8 | 응답에 `x-litellm-attempted-retries`, `x-litellm-attempted-fallbacks` 헤더를 추가한다 | `router_python_core.py` | `add_retry_headers_to_response`, `add_fallback_headers_to_response` |

6번 지점이 이번 단계의 핵심이다. `_deployment_ids_to_skip_on_retry`는 실패한 deployment의 상태 코드가 `utils.py`의 `should_retry`(408, 409, 429, 5xx)에 해당하면 빈 tuple을 반환한다. 일시적 네트워크·서버 오류라면 같은 deployment도 직후에 회복할 가능성이 있다고 판단하기 때문이다. 반대로 400 Bad Request처럼 재전송해도 동일한 오류가 날 요청만 해당 deployment를 후보에서 건너뛴다.

## 코드 및 설정

[config/2-router.yaml](../config/2-router.yaml)은 별칭 3개를 통해 load balancing, retry, fallback 세 가지 동작을 분리해 관찰하도록 구성했다. 의도적으로 실패하는 deployment는 1단계 실험 과제에서 확인한 특수 문자열 `litellm.InternalServerError`로 정의한다.

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

실제 파일은 가독성을 위해 flow style 대신 블록 style로 작성되어 있으며 설정 내용은 동일하다.

응답 헤더는 마지막으로 성공한 호출의 정보만 반영하므로 그 이전에 발생한 실패 이력이 보이지 않는다. 이를 보완하기 위해 Router를 직접 초기화하고 성공·실패 콜백으로 전체 시도 순서를 기록하는 [scripts/trace_router.py](../scripts/trace_router.py)를 함께 사용한다. 콜백(`CustomLogger`) 구현 방법은 3단계에서 본격적으로 다루며, 여기서는 내부 동작을 관찰하는 도구로만 활용한다.

## 실행 및 검증

### 1. Proxy 기동

load balancing, retry, fallback을 별칭 3개로 구성한 `config/2-router.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/2-router.yaml --port 4100
```

### 2. load balancing 분포 확인

deployment 2개가 등록된 `chat-small`을 20회 연속 호출하고, 응답 본문을 집계해 어느 deployment가 얼마나 선택되었는지 확인한다.

```bash
for i in $(seq 20); do
  curl -s localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d '{"model": "chat-small", "messages": [{"role": "user", "content": "hi"}]}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
done | sort | uniq -c
```

각 줄 앞의 숫자가 deployment별 응답 횟수를 나타낸다.

```text
   8 small-a deployment의 응답입니다.
  12 small-b deployment의 응답입니다.
```

`simple-shuffle`은 무작위 선택 전략이므로 분포 비율은 실행마다 달라지며, 정확히 10:10으로 나뉘지 않는 것이 정상이다.

### 3. retry 동작 관찰

다음은 고장 난 deployment와 정상 deployment가 하나씩 묶인 `chat-large`를 호출한다. 아래 명령을 여러 차례 반복 실행하면서 응답 헤더의 `x-litellm-model-name`과 `x-litellm-attempted-retries` 값의 변화를 확인한다.

```bash
curl -s -D - -o /dev/null localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-large", "messages": [{"role": "user", "content": "hi"}]}' \
  | grep -iE "x-litellm-(model-name|attempted)"
```

실제로 6회 호출해 HTTP 상태 코드와 두 헤더 값을 정리한 결과는 다음과 같다.

| 호출 | 결과 | `x-litellm-model-name` | `x-litellm-attempted-retries` |
| --- | --- | --- | --- |
| 1 | 200 | `openai/mock-large-ok` | 1 |
| 2 | 200 | `openai/mock-large-ok` | 1 |
| 3 | 200 | `openai/mock-large-ok` | 0 |
| 4 | **500** | `openai/mock-large-broken` | (헤더 없음) |
| 5 | 200 | `openai/mock-large-ok` | 2 |
| 6 | 200 | `openai/mock-large-ok` | 1 |

4번째 호출에서는 정상 deployment가 존재하는데도 최종 실패(500)가 발생했다. 첫 시도와 retry 2회가 모두 `mock-large-broken`으로 배정되었기 때문이다. group 내 고장 난 deployment 비율이 50%일 때 3회 연속 선택될 확률은 1/8(12.5%)이다. 이때 클라이언트가 수신한 오류 본문에는 `chat-large`에 설정된 fallback이 없어 다른 모델로 전환되지 않았다는 안내가 포함된다.

```text
litellm.InternalServerError: this is a mock internal server error

LiteLLM: model group 'chat-large' failed with the error above and no fallback model group was found for it, so the request was not retried on another model. Fallbacks are configured for: chat-broken. ...
```

### 4. fallback 동작 관찰

retry 소진 후 fallback이 이어지는 흐름을 확인하기 위해 정상 deployment가 하나도 없는 `chat-broken`을 호출한다. 이 별칭에는 `chat-small`로의 fallback이 설정되어 있으므로, 아래 명령으로 응답 헤더와 본문의 `model` 필드를 함께 확인한다.

```bash
curl -s -D - localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-broken", "messages": [{"role": "user", "content": "hi"}]}' \
  | grep -iE "x-litellm-(model-name|attempted)|\"model\""
```

출력에서 `x-litellm-attempted-fallbacks` 헤더와 응답 본문 `model` 값을 확인한다.

```text
x-litellm-model-name: openai/mock-small-b
x-litellm-attempted-retries: 0
x-litellm-attempted-fallbacks: 1
{"id":"chatcmpl-...","model":"mock-small-b", ... "content":"small-b deployment의 응답입니다." ...}
```

본문의 `model` 필드가 요청한 별칭 `chat-broken`이 아니라 `mock-small-b`로 찍혀 있다. 이는 1단계에서 확인한 `_override_openai_response_model`이 fallback 발생 시 실제 응답 모델을 별칭으로 덮어쓰지 않고 유지하기 때문이다. 또한 헤더의 `x-litellm-attempted-retries: 0`도 주의해서 읽어야 한다. 이 값은 fallback 대상인 `chat-small`에서의 retry 횟수를 의미하며, `chat-broken`에서 몇 번 실패했는지는 응답 헤더에 기록되지 않는다.

### 5. 헤더에 가려진 시도 순서 추적

응답 헤더에 드러나지 않는 `chat-broken`의 실제 실패 횟수를 확인하려면 Router의 시도 순서를 직접 로깅해야 한다. Proxy를 종료한 뒤 같은 설정으로 Router를 직접 생성하는 `scripts/trace_router.py`를 실행해 `chat-broken` 1회, `chat-large` 3회를 순차 호출한다.

```bash
uv run python scripts/trace_router.py config/2-router.yaml chat-broken chat-large chat-large chat-large
```

`시도:` 줄을 통해 각 deployment에서 발생한 실패(`fail`)와 성공(`ok`) 순서를 확인한다.

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

`chat-broken`은 첫 시도와 retry 2회를 합쳐 총 3번 실패한 뒤에야 `chat-small`로 fallback되었다. 앞선 단계에서 응답 헤더가 보여 준 `attempted-retries: 0`만으로는 알 수 없는 내부 시도 횟수다. 세 번째 `chat-large` 호출에서도 고장 난 deployment가 연속 두 번 선택되었는데, 이는 재시도 시 직전 실패 deployment를 제외하지 않는다는 내부 동작 표 6번의 설명과 일치한다.

## 아키텍처 설계 시 고려사항

retry와 fallback은 지연 시간(latency)을 비용으로 치른다. 실제 외부 provider 환경이라면 `chat-broken`의 3회 실패가 각각 요청 timeout까지 대기한 뒤에야 발생하므로, 사용자는 fallback 응답을 받기까지 `timeout × 3`만큼 기다리게 된다. 장애가 명확한 deployment를 빠르게 격리하려면 retry 횟수를 늘리기보다 `allowed_fails`와 `cooldown_time`을 설정해 cooldown을 활성화하는 편이 효과적이다. 이 실습에서 cooldown이 발동하지 않은 사실은 로그의 `Cooldown Deployments=[]`로 확인했으나, 구체적인 조건 코드는 이번 단계의 범위에서 추적하지 않았다.

## 단위 테스트

[tests/test_2_router.py](../tests/test_2_router.py)는 Proxy 없이 `litellm.Router`만 사용해 동작을 검증한다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_load_balancing_uses_both_deployments` | 30회 호출 시 등록된 deployment 2개가 모두 선택되어 응답함 |
| `test_retries_exhaust_before_fallback` | fallback 전환 전에 실패가 정확히 3회(초기 시도 + retry 2회) 발생함 |
| `test_without_fallbacks_error_reaches_client` | `disable_fallbacks=True` 설정 시 3회 실패 후 예외가 클라이언트에 그대로 전파됨 |

아래 명령으로 2단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_2_router.py
```

마지막 줄에서 세 테스트가 모두 통과했는지 확인한다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`config/2-router.yaml`의 `router_settings`에 `allowed_fails: 1`과 `cooldown_time: 30`을 추가한 뒤, `scripts/trace_router.py`로 `chat-large`를 10회 연속 호출해 본다. cooldown이 정상 동작하면 고장 난 deployment가 한 번 실패한 뒤 30초간 후보에서 제외되므로 이후 시도 목록에서 `mock-large-broken`이 사라져야 한다. 만약 제외되지 않는다면 `router_utils/cooldown_handlers.py`에서 cooldown을 건너뛰는 조건을 찾아본다.
