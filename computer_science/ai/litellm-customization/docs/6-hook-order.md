# 5단계. 훅 두 개의 실행 순서와 metadata 표식

## 이번 단계에서 배울 개념

- `litellm_settings.callbacks`에 적은 순서가 곧 pre_call 훅의 실행 순서다. 앞 훅이 돌려준 dict를 다음 훅이 받으므로, 같은 필드를 고치는 훅이 둘이면 **마지막 훅의 결정이 이긴다**.
- 훅끼리 서로를 모르게 두면 config의 한 줄 순서가 비즈니스 규칙이 된다. 순서를 바꾸는 사소한 변경이 라우팅 결과를 뒤집어도 코드 리뷰에서 드러나지 않는다.
- 앞 훅이 `metadata`에 "내가 결정했다"는 표식을 남기고 뒤 훅이 그 표식을 확인하면, 순서와 무관하게 "먼저 결정한 훅이 이긴다"는 규칙을 코드로 명시할 수 있다.

예제는 방향이 반대인 두 훅이다. 훅 A(`upgrade_hook`)는 4단계의 키워드 규칙으로 큰 모델로 올리고, 훅 B(`downgrade_hook`)는 20자 이하의 짧은 질문을 비용 절감을 위해 작은 모델로 내린다. "이 코드 고쳐줘"는 키워드가 있으면서 짧아서 두 훅이 충돌한다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| 콜백 체인 | `callbacks` 순서대로 pre_call 훅이 이어 실행되는 구조 | `[upgrade_hook, downgrade_hook]` |
| last-writer-wins | 같은 값을 여러 곳이 쓰면 마지막에 쓴 값이 남는 방식 | 표식이 없을 때의 결과 |
| 표식(lock) | 결정한 훅의 이름을 요청 metadata에 남긴 값 | `metadata.routing_locked_by = "upgrade_hook"` |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | config의 `callbacks` 목록을 순서대로 import해 콜백 목록을 만든다 | `proxy/common_utils/callback_utils.py` | `initialize_callbacks_on_proxy` |
| 2 | 등록된 콜백을 목록 순서대로 순회한다 | `proxy/utils.py` | `ProxyLogging.pre_call_hook` (`for _callback in caps.resolved_callbacks`) |
| 3 | 각 훅의 반환값을 `data`에 다시 대입해 다음 훅으로 넘긴다 | `proxy/utils.py` | `ProxyLogging.process_pre_call_hook_response` |

2번 루프는 훅끼리 조율하지 않는다. 훅 하나가 str을 돌려주거나 예외를 던지면 그 자리에서 요청이 거절되어 뒤 훅은 실행되지 않지만, dict를 돌려주는 한 모든 훅이 순서대로 실행되고 마지막 대입만 남는다.

## 코드와 config

[gateway/routing_order.py](../gateway/routing_order.py)는 두 훅이 같은 결정 함수를 쓴다. `use_lock`이 꺼져 있으면 무조건 덮어쓰고, 켜져 있으면 표식을 먼저 확인한다.

```python
LOCK_KEY = "routing_locked_by"


def decide_model(data: dict, model: str, owner: str, use_lock: bool) -> dict:
  if use_lock and locked_by(data):
    return add_spend_logs_metadata(data, {owner: f"skip (locked by {locked_by(data)})"})
  data["model"] = model
  if use_lock:
    data.setdefault("metadata", {})[LOCK_KEY] = owner
  return add_spend_logs_metadata(data, {owner: f"-> {model}"})
```

두 훅 클래스는 각자 `async_pre_call_hook`을 직접 선언한다. 3단계에서 본 대로 Proxy는 메서드가 그 클래스에 직접 정의되어 있는지 검사하므로, 공통 기반 클래스에만 두면 호출되지 않는다. 모듈 끝에서 표식을 쓰지 않는 인스턴스 2개와 쓰는 인스턴스 2개를 만든다.

config는 `callbacks` 한 줄만 다른 세 파일이다.

| config | callbacks 순서 | 표식 |
|---|---|---|
| [config/5-order-ab.yaml](../config/5-order-ab.yaml) | `upgrade_hook` → `downgrade_hook` | 없음 |
| [config/5-order-ba.yaml](../config/5-order-ba.yaml) | `downgrade_hook` → `upgrade_hook` | 없음 |
| [config/5-order-locked.yaml](../config/5-order-locked.yaml) | `upgrade_hook_locking` → `downgrade_hook_locking` | 있음 |

## 실행

### 1. A → B 순서의 Proxy 기동과 충돌 질문 전송

Postgres가 떠 있어야 한다([1-setup.md의 4번](1-setup.md)). 먼저 훅 A가 앞에 오는 `config/5-order-ab.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/5-order-ab.yaml --port 4100
```

두 훅이 충돌하는 "이 코드 고쳐줘"를 `chat-small`로 보내고, 응답 헤더의 `x-litellm-model-group`에서 실제로 답한 별칭을 본다.

```bash
curl -s -D - localhost:4100/v1/chat/completions \
  -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
  -d '{"model": "chat-small", "messages": [{"role": "user", "content": "이 코드 고쳐줘"}]}' \
  | grep -iE "x-litellm-model-group|content"
```

### 2. B → A 순서와 표식 버전의 결과 비교

같은 요청이 순서와 표식에 따라 어떻게 달라지는지 보려고, Proxy를 끄고 `config/5-order-ba.yaml`, `config/5-order-locked.yaml`로 바꿔 같은 요청을 보낸다. 각 요청 뒤에는 가장 최근 spend log 한 행을 조회해, 두 훅이 `spend_logs_metadata`에 남긴 결정을 확인한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select left(request_id,20), model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 1"
```

세 config의 결과를 답한 별칭과 훅별 기록으로 나란히 놓았다.

| config | 답한 별칭 | spend_logs_metadata |
|---|---|---|
| ab | `chat-small` | `{"upgrade_hook": "-> chat-large", "downgrade_hook": "-> chat-small"}` |
| ba | `chat-large` | `{"upgrade_hook": "-> chat-large", "downgrade_hook": "-> chat-small"}` |
| locked | `chat-large` | `{"upgrade_hook": "-> chat-large", "downgrade_hook": "skip (locked by upgrade_hook)"}` |

ab와 ba는 훅 코드가 같고 config 순서만 다른데 답한 별칭이 정반대다. 두 경우 모두 마지막에 실행된 훅의 결정이 남았기 때문이다. 그런데 두 행의 spend_logs_metadata는 **글자까지 같다**. Postgres `jsonb`는 key를 자체 규칙으로 정렬해 저장하므로, 어느 훅이 먼저 실행됐는지가 dict에서 사라진다. 실행 순서를 남기려면 dict가 아니라 목록에 차례로 추가해야 하며, 11단계에서 이렇게 바꾼다. 반면 locked에서는 B가 표식을 보고 결정을 건너뛴 사실까지 기록된다.

## 표식 방식의 한계

표식은 "먼저 결정한 훅이 이긴다"는 규칙을 명시할 뿐, 어느 훅이 먼저인지는 여전히 `callbacks` 순서가 정한다. 테스트 `test_lock_follows_order_too`가 보여 주듯 표식 버전도 순서를 뒤집으면 작은 모델이 이긴다. 그래서 실무에서는 표식에 더해 훅 사이의 우선순위를 정하는 방법이 함께 필요하다.

| 방법 | 장점 | 단점 |
|---|---|---|
| callbacks 순서에만 의존 | 코드가 가장 단순하다 | config 순서가 숨은 규칙이 된다 |
| metadata 표식 | 각 훅이 독립적으로 배포되면서도 충돌 시 동작이 명시된다 | 우선순위 자체는 여전히 순서가 정한다 |
| 훅 하나로 합치기(라우팅 결정 전담 훅) | 우선순위가 한 함수 안의 if 순서로 드러난다 | 훅이 커지고 기능별 on/off가 어려워진다 |

6단계의 의도 분류 체인은 세 번째 방식을 택한다. 프리필터, LLM 분류, 규칙 판정을 훅 하나 안에서 순서대로 실행해 우선순위를 코드에 둔다.

## 단위 테스트

[tests/test_5_routing_order.py](../tests/test_5_routing_order.py)는 Proxy의 순회 방식을 그대로 흉내 내는 `run_chain`으로 훅을 이어 실행한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_last_hook_wins_without_lock` | 표식이 없으면 순서를 뒤집을 때 결과도 뒤집힌다 |
| `test_lock_makes_first_decision_stick` | 표식이 있으면 앞 훅의 결정이 유지되고 뒤 훅의 skip이 기록된다 |
| `test_lock_follows_order_too` | 표식 버전도 순서를 뒤집으면 먼저 실행된 훅이 이긴다 |

세 테스트를 한 번에 실행한다.

```bash
uv run pytest tests/test_5_routing_order.py
```

마지막 줄의 `3 passed`로 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`config/5-order-locked.yaml`의 `callbacks`에 3단계의 `gateway.metadata_tagger.metadata_tagger`를 맨 앞과 맨 뒤에 각각 넣어 본다. `metadata_tagger`는 `model`을 건드리지 않으므로 어느 위치든 라우팅 결과는 같아야 한다. spend log의 `spend_logs_metadata`에 세 훅의 기록이 모두 합쳐지는지, 위치에 따라 달라지는 것이 있는지 확인한다.
