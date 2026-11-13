# 6단계. 의도 분류 체인과 분류 결과 캐시

## 이번 단계에서 배울 개념

- 라우팅 판단을 세 단계로 나눈다. 글자만 보고 확신할 수 있으면 **문자열 프리필터**가 끝내고, 애매하면 **작은 LLM**에 JSON 한 줄로 분류를 맡기고, 그 호출이 느리거나 형식이 틀리면 **규칙 판정**으로 대신한다. 우선순위가 훅 하나 안의 코드 순서로 드러난다.
- pre_call 훅 안에서 `litellm.proxy.proxy_server.llm_router`로 다른 별칭을 부를 수 있다. 이 호출은 Proxy endpoint를 거치지 않으므로 pre_call 훅이 다시 실행되지 않는다.
- 같은 질문은 같은 분류 결과를 받아야 한다. 질문을 정규화해 sha256으로 key를 만들고 결과를 캐시하면 분류 비용과 지연이 사라지고 응답 모델이 흔들리지 않는다. 프로세스 메모리 캐시는 재시작하면 비므로, replica가 여럿이거나 재시작 뒤에도 유지하려면 Valkey 같은 외부 저장소가 필요하다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| 프리필터 | 비용 없이 확실한 경우만 걸러내는 첫 단계 | 키워드가 있으면 heavy, 10자 이하 인사말이면 light |
| 분류 모델 | 의도 판정만 하는 작은 LLM 별칭 | `intent-classifier` (mock, 항상 `{"intent": "heavy"}`) |
| 시간 제한 | 분류 호출을 기다리는 최대 시간 | `asyncio.wait_for(..., timeout=0.5)` |
| 규칙 판정 | 분류 실패 시 마지막 수단 | 40자 초과면 heavy |
| 질문 해시 | 공백·대소문자를 정규화한 질문의 sha256 | `intent:df689ae5...` |
| Valkey | Redis 호환 오픈소스 key-value 저장소 | `compose.yaml`의 `valkey` (host port 6380) |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | Proxy가 시작할 때 만든 Router를 모듈 전역 변수에 둔다 | `proxy/proxy_server.py` | 전역 `llm_router` |
| 2 | 훅이 그 Router로 분류 모델을 부른다. Router 자체에는 pre_call 훅 실행 단계가 없다 | `router_python_core.py` | `PythonCore.acompletion` |
| 3 | pre_call 훅은 Proxy endpoint 처리에서만 실행된다 | `proxy/common_request_processing.py` | `common_processing_pre_call_logic` |

`llm_router`는 모듈 전역 변수라 `from ... import llm_router`를 훅 모듈 맨 위에 쓰면 import 시점의 값(`None`일 수 있다)이 고정된다. 그래서 [gateway/intent_router.py](../gateway/intent_router.py)의 `proxy_router()`는 호출할 때마다 `from litellm.proxy.proxy_server import llm_router`를 다시 실행한다.

## 코드와 config

분류 체인은 `classify`가 정하고, 캐시는 훅 본문이 감싼다.

```python
async def classify(self, question: str) -> tuple[str, str]:
  intent = prefilter(question)
  if intent:
    return intent, "prefilter"
  try:
    return await self.classify_with_llm(question), "llm"
  except Exception as error:
    return rule_fallback(question), f"rule ({type(error).__name__})"

async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
  question = last_user_text(data.get("messages", []))
  key = question_key(question)
  intent = await self.cache.get(key)
  source = "cache"
  if intent is None:
    intent, source = await self.classify(question)
    if source == "llm":
      await self.cache.set(key, intent)
  data["model"] = INTENT_MODELS[intent]
  return add_spend_logs_metadata(data, {"intent_router": f"{intent} via {source}"})
```

LLM 분류 결과만 캐시한다. 프리필터는 다시 해도 비용이 없고, 규칙 판정은 분류 모델이 잠시 느렸다는 일시적 상황의 결과라서 캐시하면 그 판단이 TTL(1시간) 동안 굳는다.

캐시는 [gateway/intent_cache.py](../gateway/intent_cache.py)에 같은 인터페이스(`get`, `set`)로 두 구현을 둔다. `InMemoryIntentCache`는 dict이고, `ValkeyIntentCache`는 `redis.asyncio` 클라이언트로 `REDIS_URL`에 TTL과 함께 저장한다. `redis` 패키지는 `litellm[proxy]` 의존성으로 이미 설치되어 있다.

config는 분류 모델 별칭을 하나 더 등록하고 콜백 인스턴스만 바꾼다.

| config | 콜백 | 분류 모델 지연 |
|---|---|---|
| [config/6-intent-memory.yaml](../config/6-intent-memory.yaml) | `intent_router_memory` | 0.3초 |
| [config/6-intent-slow.yaml](../config/6-intent-slow.yaml) | `intent_router_memory` | 2초 (시간 제한 0.5초 초과) |
| [config/6-intent-valkey.yaml](../config/6-intent-valkey.yaml) | `intent_router_valkey` | 0.3초 |

## 실행

Postgres와 Valkey가 떠 있고 `.env`의 `DATABASE_URL`, `REDIS_URL` 주석이 풀려 있어야 한다([1-setup.md의 4번](1-setup.md)).

### 1. in-memory 캐시에서 세 판정 경로와 캐시 적중 확인

먼저 프로세스 메모리에 캐시를 두는 `config/6-intent-memory.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/6-intent-memory.yaml --port 4100
```

프리필터가 light로 끝낼 인사말, 프리필터가 heavy로 끝낼 키워드 질문, 분류 모델이 필요한 질문, 그리고 같은 질문을 공백만 두 칸으로 바꾼 것을 차례로 보내고, 질문마다 응답 시간과 답한 별칭을 출력한다.

```bash
for q in "안녕" "코드 리뷰 부탁해" "광합성 원리를 단계별로 설명해줘" "광합성 원리를 단계별로  설명해줘"; do
  curl -s -o /dev/null -D /tmp/h.txt -w "$q %{time_total}s " localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d "{\"model\": \"chat-small\", \"messages\": [{\"role\": \"user\", \"content\": \"$q\"}]}"
  grep -i x-litellm-model-group /tmp/h.txt
done
```

응답 시간 열에서 세 번째 질문만 0.3초대로 튀는 점을 본다.

```text
안녕 0.125088s x-litellm-model-group: chat-small
코드 리뷰 부탁해 0.009505s x-litellm-model-group: chat-large
광합성 원리를 단계별로 설명해줘 0.328606s x-litellm-model-group: chat-large
광합성 원리를 단계별로  설명해줘 0.012775s x-litellm-model-group: chat-large
```

응답 시간만으로는 어느 단계가 판정했는지 알 수 없으므로, spend log의 `intent_router` 값에서 판정 출처를 확인한다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 4"
```

최신 행이 위에 오므로, 아래에서부터 prefilter, prefilter, llm, cache 순서로 읽는다.

```text
chat-large|{"intent_router": "heavy via cache"}
chat-large|{"intent_router": "heavy via llm"}
chat-large|{"intent_router": "heavy via prefilter"}
chat-small|{"intent_router": "light via prefilter"}
```

세 번째 질문만 분류 모델을 불러 `mock_delay` 0.3초가 그대로 응답 시간에 더해졌다. 분류 단계가 사용자가 기다리는 경로 위에 있다는 뜻이다. 네 번째 질문은 공백이 두 칸이지만 정규화 후 같은 해시가 되어 캐시가 받았고, 0.01초로 돌아왔다. 첫 요청 `안녕`의 0.125초는 Proxy가 첫 요청을 처리하며 생기는 준비 시간이므로, 프리필터 자체의 비용은 두 번째 요청(0.009초)에 가깝다.

한편 분류 모델 호출은 spend log에 행을 만들지 않았다. 네 요청에 네 행만 생겼으므로, 분류 비용을 추적하려면 별도 기록이 필요하다.

### 2. 분류 모델 지연 시 규칙 판정으로의 전환

분류 모델이 늘 0.3초 안에 답한다는 보장은 없다. 분류 모델 지연을 2초로 늘려 시간 제한 0.5초를 넘기는 `config/6-intent-slow.yaml`로 Proxy를 다시 띄운다.

```bash
uv run --env-file .env litellm --config config/6-intent-slow.yaml --port 4100
```

같은 방식으로 "광합성 원리를 단계별로 설명해줘"와 "블랙홀이 생기는 과정과 관측 방법, 그리고 최근 연구 동향을 정리해줘"를 보낸다. 두 질문의 응답 시간과 답한 별칭을 본다.

```text
광합성 원리를 단계별로 설명해줘 0.662732s x-litellm-model-group: chat-small
블랙홀이 생기는 과정과 관측 방법, 그리고 최근 연구 동향을 정리해줘 0.526939s x-litellm-model-group: chat-small
```

같은 spend log 조회에서는 두 요청의 판정 출처가 `rule (TimeoutError)`로 남는다.

```text
chat-small|{"intent_router": "light via rule (TimeoutError)"}
chat-small|{"intent_router": "light via rule (TimeoutError)"}
```

분류 모델은 2초가 걸리지만 응답은 0.5초 남짓에 끝났다. 시간 제한이 사용자 지연의 상한을 정하기 때문이다. 대신 두 질문 모두 규칙(40자 초과면 heavy)에 걸리지 않아 작은 모델로 갔다. 블랙홀 질문은 무거운 질문인데도 38자라서 놓쳤다. 규칙 판정은 서비스를 멈추지 않기 위한 안전망이지 정확도를 내는 단계가 아니다.

### 3. Proxy 재시작 후 Valkey 캐시 유지 확인

in-memory 캐시는 재시작하면 비므로, 이번에는 Valkey에 캐시를 두고 재시작 뒤에도 분류 결과가 남는지 본다. 먼저 Valkey를 비운다.

```bash
docker compose exec -T valkey valkey-cli flushall
```

Valkey 캐시 인스턴스를 콜백으로 쓰는 `config/6-intent-valkey.yaml`로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/6-intent-valkey.yaml --port 4100
```

"광합성 원리를 단계별로 설명해줘"를 한 번 보내고 Proxy를 껐다가 다시 띄운 뒤 같은 질문을 보낸다. 두 기동에서 답한 별칭과 응답 시간을 비교한다.

```text
첫 기동:  광합성 원리를 단계별로 설명해줘 0.483886s x-litellm-model-group: chat-large
재기동 후: 광합성 원리를 단계별로 설명해줘 0.157319s x-litellm-model-group: chat-large
```

spend log에서는 재기동 전 요청이 `via llm`, 재기동 후 요청이 `via cache`로 남는다.

```text
chat-large|{"intent_router": "heavy via cache"}
chat-large|{"intent_router": "heavy via llm"}
```

캐시가 Valkey에 어떤 모양으로 남았는지 보려고, `intent:` 접두사의 key를 찾고 그 key의 TTL을 조회한다.

```bash
docker compose exec -T valkey valkey-cli --scan --pattern 'intent:*'
docker compose exec -T valkey valkey-cli ttl intent:df689ae5a2d1a63a32be61ca50c7930c67a1be145d33e74959306bfaf8a0ab7d
```

첫 줄이 key 이름이고, 둘째 줄이 남은 TTL이다.

```text
intent:df689ae5a2d1a63a32be61ca50c7930c67a1be145d33e74959306bfaf8a0ab7d
3564
```

재기동 뒤 첫 요청인데도 `via cache`다. in-memory 캐시였다면 재기동으로 비어서 다시 분류 모델을 불렀을 것이다. 또 key에는 질문 원문이 아니라 해시만 있으므로, 캐시 저장소를 들여다봐도 사용자 질문이 보이지 않는다. TTL은 기록 시점부터 줄어들기 때문에 확인하는 시점마다 값이 다르다.

## 캐시를 쓰는 이유와 대가

| 관점 | 캐시가 없을 때 | 캐시가 있을 때 |
|---|---|---|
| 비용 | 같은 질문에도 매번 분류 모델 요금 | 첫 질문만 요금 |
| 지연 | 매번 분류 지연(이 실습 0.3초)이 응답 앞에 붙음 | 캐시 조회(0.01초 수준) |
| 일관성 | LLM 분류는 같은 질문에도 답이 흔들릴 수 있어 같은 질문이 다른 모델로 감 | TTL 동안 같은 질문은 같은 모델 |

대가는 틀린 분류도 TTL 동안 유지된다는 점이다. 분류 모델이나 프롬프트를 바꾸면 key 접두사(`intent:`)에 버전을 넣어(`intent:v2:`) 이전 결과를 버리는 방식이 필요하다. 또 질문 해시는 완전히 같은 문장만 묶으므로, 표현만 다른 같은 질문에는 적중하지 않는다.

## 단위 테스트

[tests/test_6_intent_router.py](../tests/test_6_intent_router.py)는 Proxy의 Router 대신 `FakeRouter`를 주입한다. 정해진 content로 답하거나 일부러 늦게 답하고, 호출 횟수를 센다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_prefilter_decides_without_llm` | 프리필터가 정하면 분류 모델을 부르지 않는다 |
| `test_llm_result_is_cached_by_normalized_question` | 공백만 다른 질문은 캐시가 받아 분류 모델을 한 번만 부른다 |
| `test_slow_or_broken_classifier_falls_back_to_rule_without_caching` | 시간 초과와 JSON 형식 오류가 모두 규칙 판정으로 가고, 그 결과는 캐시되지 않는다 |

세 테스트를 한 번에 실행한다.

```bash
uv run pytest tests/test_6_intent_router.py
```

마지막 줄의 `3 passed`로 세 테스트가 모두 통과했는지 본다.

```text
...                                                                      [100%]
3 passed
```

## 실험 과제

`config/6-intent-memory.yaml`의 분류 모델 `mock_response`를 `'heavy'`(JSON이 아닌 문자열)로 바꿔 띄우고 "광합성 원리를 단계별로 설명해줘"를 두 번 보낸다. spend log에 `rule (JSONDecodeError)`가 두 번 찍히는지, 즉 실패 결과가 캐시되지 않아 매번 분류 모델을 다시 부르는지 확인한다. 이 동작이 분류 모델 장애 중에 비용을 늘린다는 점도 함께 생각해 본다.
