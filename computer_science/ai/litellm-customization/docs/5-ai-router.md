# 4단계. 로컬 소형 모델이 보낼 모델을 고르는 훅

## 이번 단계에서 배울 개념

- **pre_call 훅을 통한 동적 모델 라우팅**: pre_call 훅에서 `data["model"]`을 변경하면 Router는 변경된 별칭으로 deployment를 선택한다. 클라이언트는 일관되게 `claude`를 호출하더라도, gateway가 질문 성격을 분석해 `gemini`로 우회시킬 수 있다.
- **소형 LLM 기반 판정**: 단순 키워드 규칙 대신 **작은 LLM**에 라우팅 판단을 위임한다. 훅이 `litellm.proxy.proxy_server.llm_router`를 통해 판정 전용 별칭(`router-judge`)을 호출하고, 반환된 JSON 한 줄에서 선택한 별칭을 꺼내 `data["model"]`에 대입한다. 판정 모델은 로컬 Ollama의 `gemma2:2b`를 사용하며 `num_gpu: 0` 옵션으로 CPU 전용 추론을 수행한다.
- **Fail-safe 설계**: 판정 호출은 타임아웃, 연결 오류, 잘못된 JSON 응답 등으로 실패할 수 있다. 이 경우 예외를 전파하지 않고 클라이언트가 원래 요청한 모델을 그대로 유지해, 판정 계층의 장애가 전체 요청 실패로 이어지지 않도록 방어한다.

예제 시나리오는 Q&A 챗봇이다. 코드 작성·디버깅·시스템 설계처럼 다단계 추론이 필요한 질문은 `claude`가, 일상 대화·추천·단순 사실 질문은 `gemini`가 처리한다고 가정한다. 두 별칭은 이름만 실제 모델을 모방한 mock 모델이며, 실제 추론 호출은 로컬 Ollama의 판정 모델에만 발생한다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| 판정 모델 | 질문에 직접 답하지 않고 라우팅 대상 모델만 분류하는 소형 LLM | `router-judge` (`ollama_chat/gemma2:2b`) |
| 모델 교체 | 훅이 요청의 `model` 필드를 다른 별칭으로 덮어쓰는 동작 | `claude` → `gemini` |
| `num_gpu` | Ollama가 GPU에 올릴 레이어 수 (`0`이면 CPU 전용 추론) | `litellm_params.num_gpu: 0` |
| JSON mode | 모델 응답을 유효한 JSON 객체 형식으로 강제하는 옵션 | `response_format={"type": "json_object"}` |

## LiteLLM 내부 동작 위치

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | 훅 실행 전에 클라이언트가 요청한 원본 `model`을 별도 저장한다 | `proxy/common_request_processing.py` | `ProxyBaseLLMRequestProcessing.base_process_llm_request` (`requested_model_from_client`) |
| 2 | pre_call 훅 체인을 실행하고, 반환된 dict로 `self.data`를 교체한다 | `proxy/common_request_processing.py` → `proxy/utils.py` | `common_processing_pre_call_logic` → `ProxyLogging.pre_call_hook` |
| 3 | 훅이 Proxy 기동 시 생성된 Router로 판정 모델을 호출한다 (Router 직접 호출은 pre_call 훅 미실행) | `proxy/proxy_server.py`, `router_python_core.py` | 전역 `llm_router`, `PythonCore.acompletion` |
| 4 | 교체된 `data["model"]`로 본 요청을 Router에 전달한다 | `proxy/route_llm_request.py` | `route_request` |
| 5 | 응답 본문의 `model` 필드를 1번에서 저장한 원본 값으로 덮어쓴다 | `proxy/common_request_processing.py` | `_override_openai_response_model` |

3번의 판정 모델 호출은 Proxy의 HTTP endpoint를 거치지 않고 `llm_router`를 직접 부르므로, pre_call 훅이 재귀적으로 실행되지 않고 spend log 행도 별도로 생성되지 않는다. 한편 `llm_router`는 모듈 전역 변수여서 훅 파일 최상단에서 import하면 초기화 이전 값(`None`)이 바인딩될 수 있다. 이를 피하기 위해 [gateway/ai_router.py](../gateway/ai_router.py)의 `proxy_router()`는 호출 시점마다 지연 import를 수행한다.

1번과 5번 동작 덕분에 클라이언트 입장에서는 모델 교체가 투명하게 처리된다. 응답 본문의 `model` 필드는 항상 요청한 `claude`로 반환되므로, 실제로 어느 별칭이 응답했는지는 응답 헤더 `x-litellm-model-group`이나 spend log를 통해서만 확인할 수 있다. 이 때문에 훅이 판정 결과와 소요 시간을 `spend_logs_metadata`에 함께 기록한다.

## 코드 및 설정

[gateway/ai_router.py](../gateway/ai_router.py)의 핵심은 제한 시간 내에 판정 모델을 호출하는 `judge` 메서드와, 어떤 예외가 발생해도 원본 모델을 유지하는 `async_pre_call_hook`이다.

```python
JUDGE_PROMPT = """You route a user question to one of two models.
- claude: writing or reviewing code, debugging, system design, multi-step reasoning.
- gemini: casual chat, recommendations, short factual questions, translation.
Reply with one JSON object only: {"model": "claude"} or {"model": "gemini"}."""


class AiRouter(CustomLogger):
  async def judge(self, question: str) -> str:
    response = await asyncio.wait_for(
      self.get_router().acompletion(
        model=JUDGE_MODEL,
        messages=[{"role": "system", "content": JUDGE_PROMPT}, {"role": "user", "content": question}],
        response_format={"type": "json_object"},
      ),
      timeout=self.timeout,
    )
    return parse_choice(response.choices[0].message.content)

  async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type) -> dict:
    requested = data.get("model")
    started = time.monotonic()
    try:
      data["model"] = await self.judge(last_user_text(data.get("messages", [])))
      decision = f"{requested}->{data['model']}"
    except Exception as error:
      decision = f"{requested} kept ({type(error).__name__})"
    elapsed = time.monotonic() - started
    return add_spend_logs_metadata(data, {"ai_router": f"{decision} in {elapsed:.1f}s"})
```

판정 프롬프트는 영어로 작성했으나 한국어 질문 4종에 대해서도 모두 의도대로 분류되었다. `parse_choice`는 응답이 후보 별칭(`claude`, `gemini`) 중 하나가 아니면 `ValueError`를 발생시켜, 모델이 엉뚱한 이름을 출력하더라도 존재하지 않는 별칭으로 라우팅되는 사고를 막는다. CPU 전용 판정이 10초 이상 걸리므로 타임아웃은 여유 있게 30초(`JUDGE_TIMEOUT_SECONDS = 30.0`)로 설정했다.

아래는 [config/4-ai-router.yaml](../config/4-ai-router.yaml)에서 mock 별칭 2개, 판정 모델 1개, 그리고 `ai_router` 콜백을 등록한 핵심 설정 부분이다.

```yaml
model_list:
  - model_name: claude
    litellm_params: { model: openai/mock-claude, mock_response: "claude 별칭의 mock 응답입니다." }
  - model_name: gemini
    litellm_params: { model: openai/mock-gemini, mock_response: "gemini 별칭의 mock 응답입니다." }
  - model_name: router-judge
    litellm_params:
      model: ollama_chat/gemma2:2b
      api_base: http://localhost:11434
      num_gpu: 0
      temperature: 0

litellm_settings:
  callbacks: ["gateway.ai_router.ai_router"]
```

`num_gpu`는 LiteLLM이 Ollama API의 `options` 필드로 전달하는 매개변수다. `temperature: 0`은 동일한 질문에 대해 일관된 판정 결과를 얻기 위해 설정한다.

## 실행 및 검증

이 단계를 실행하려면 Postgres([1-setup.md의 4번](1-setup.md#4-postgres-기동-3단계부터))와 Ollama `gemma2:2b` 모델([1-setup.md의 5번](1-setup.md#5-ollama-판정-모델-준비-4단계부터))이 모두 준비되어 있어야 한다.

### 1. Proxy 기동

판정 모델과 `AiRouter` 훅을 등록한 `config/4-ai-router.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/4-ai-router.yaml --port 4100
```

### 2. 질문 4종을 모두 claude로 요청

코드·설계 질문 2개와 일상·사실 질문 2개를 모두 `model: "claude"`로 전송한다. 반복문은 각 요청마다 응답 본문의 `model` 및 내용과 함께 응답 헤더의 `x-litellm-model-group`을 출력한다. 판정 1회당 10초 이상 소요되므로 전체 4개 요청이 완료되기까지 약 1분이 걸린다.

```bash
for q in "파이썬 asyncio 코드에서 데드락이 나는 원인을 분석해줘" "오늘 점심 메뉴 추천해줘" "대한민국 수도는 어디야?" "주문 서비스를 마이크로서비스로 나누는 설계를 검토해줘"; do
  echo "Q: $q"
  curl -s -D /tmp/h.txt localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d "{\"model\": \"claude\", \"messages\": [{\"role\": \"user\", \"content\": \"$q\"}]}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['model'], '|', d['choices'][0]['message']['content'])"
  grep -i x-litellm-model-group /tmp/h.txt
done
```

질문별로 본문의 `model` 필드와 헤더의 `x-litellm-model-group` 값을 비교한다.

```text
Q: 파이썬 asyncio 코드에서 데드락이 나는 원인을 분석해줘
claude | claude 별칭의 mock 응답입니다.
x-litellm-model-group: claude
Q: 오늘 점심 메뉴 추천해줘
claude | gemini 별칭의 mock 응답입니다.
x-litellm-model-group: gemini
Q: 대한민국 수도는 어디야?
claude | gemini 별칭의 mock 응답입니다.
x-litellm-model-group: gemini
Q: 주문 서비스를 마이크로서비스로 나누는 설계를 검토해줘
claude | claude 별칭의 mock 응답입니다.
x-litellm-model-group: claude
```

판정 모델이 네 질문을 모두 의도대로 분류했다. 본문의 `model` 필드는 네 번 모두 `claude`로 고정되어 있으므로, 실제로 어느 별칭이 선택되었는지는 응답 헤더와 답변 내용으로만 구분된다.

### 3. 판정 모델의 CPU 전용 실행 확인

`num_gpu: 0` 옵션이 Ollama까지 정상 전달되었는지 확인하려면 현재 메모리에 적재된 모델 상태를 조회한다.

```bash
ollama ps
```

출력 결과에서 `PROCESSOR` 컬럼을 확인한다.

```text
NAME         ID              SIZE      PROCESSOR    CONTEXT    UNTIL
gemma2:2b    8ccf136fdd52    2.1 GB    100% CPU     4096       4 minutes from now
```

`100% CPU`로 표시되면 GPU 가속을 사용하지 않고 CPU로만 추론한 것이다. 설정에서 `num_gpu` 줄을 제거하면 Apple Silicon 환경에서는 자동으로 Metal GPU에 적재된다.

### 4. spend log의 판정 결과 및 지연 시간 확인

훅이 기록한 라우팅 결정과 소요 시간을 확인하기 위해 최근 spend log 4행을 조회한다(최신 행이 최상단에 출력된다).

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 4"
```

`model_group` 컬럼과 마지막 컬럼의 `ai_router` 기록을 확인한다. 소요 시간은 실행 환경에 따라 달라진다.

```text
claude|{"ai_router": "claude->claude in 17.7s"}
gemini|{"ai_router": "claude->gemini in 12.2s"}
gemini|{"ai_router": "claude->gemini in 13.4s"}
claude|{"ai_router": "claude->claude in 10.7s"}
```

판정 모델 호출 자체는 별도 spend log 행을 만들지 않고, 판정 결과만 바깥 요청의 메타데이터에 합쳐져 기록되었다. Apple M3 Pro CPU 전용 환경에서는 판정 1회에 10.7~17.7초가 걸렸다. 답변 모델이 mock이라 0초에 가깝게 응답하므로, 사용자가 체감한 전체 지연 시간은 사실상 판정 모델의 추론 시간이다.

## CPU 전용 판정의 Trade-off

| 관점 | CPU 전용 소형 모델 판정 | 키워드 규칙 |
| --- | --- | --- |
| 판정 품질 | 문맥과 의미를 이해해 "데드락 원인 분석"과 "점심 메뉴"를 구분함 | 단순 문자열 매칭이므로 "코드명"에 "코드"가 걸리는 등 오탐(false positive) 발생 |
| 지연 시간 | 이 실습 기준 판정 1회당 10~18초가 모든 요청에 추가됨 | 0ms에 가까움 |
| 비용 및 자원 | 외부 API 비용은 없으나 판정 동안 gateway 머신의 CPU를 점유함 | 추가 자원 소모 없음 |
| 장애 처리 | 타임아웃·JSON 파싱 오류를 흡수하는 방어 코드가 필수임 | 실패 가능성 없음 |
| 하드웨어 의존성 | GPU를 붙이면 동일 모델의 추론 속도가 수십 배 빨라짐 | 하드웨어 의존성 없음 |

CPU 전용 구성은 GPU가 없는 서버에서도 동일하게 재현할 수 있다는 장점이 있지만, 10초 이상의 지연을 실시간 대화형 챗봇의 모든 요청에 그대로 부과하기는 어렵다. 실무에 적용하려면 판정 결과를 캐싱하거나, 명확한 질문은 규칙으로 먼저 걸러내고 모호한 요청만 LLM으로 넘기거나, 판정 모델만 전용 GPU 서버에 배치하는 방식으로 지연 시간을 줄여야 한다. 이어지는 5단계의 LiteLLM 내장 `complexity_router`는 이러한 조합(키워드 규칙, LLM 분류기, 실패 시 로컬 휴리스틱 폴백)을 설정만으로 제공한다.

## 단위 테스트

[tests/test_4_ai_router.py](../tests/test_4_ai_router.py)는 판정 모델 대신 지정된 응답 문자열을 반환하는 fake Router를 주입해 Ollama 없이 실행되며, 특히 판정 실패 시의 방어 경로를 집중적으로 검증한다.

| 테스트 | 검증 내용 |
| --- | --- |
| `test_judge_choice_replaces_model_and_is_recorded` | 판정 결과에 따라 `model`이 교체되고, 판정 별칭으로 호출되며, 결과가 spend log 메타데이터에 기록됨 |
| `test_unknown_choice_keeps_requested_model` | 후보 외의 별칭이 반환되면 원래 요청 모델을 유지함 |
| `test_slow_judge_keeps_requested_model` | 판정 모델이 제한 시간을 초과하면 원래 요청 모델을 유지함 |
| `test_parse_choice_rejects_non_json` | JSON 형식이 아닌 응답에 대해 `ValueError`가 발생함 |

아래 명령으로 4단계 단위 테스트만 실행한다.

```bash
uv run pytest tests/test_4_ai_router.py
```

마지막 줄에서 네 테스트가 모두 통과했는지 확인한다.

```text
....                                                                     [100%]
4 passed
```

## 실험 과제

`config/4-ai-router.yaml`에서 `num_gpu: 0` 줄을 제거하고 Proxy를 재기동한 뒤 동일한 네 질문을 다시 전송해 본다. `ollama ps` 출력의 `PROCESSOR` 항목이 어떻게 달라지는지, spend log에 기록된 판정 시간이 몇 배 단축되는지, 그리고 네 질문에 대한 라우팅 결과는 동일하게 유지되는지 확인한다.
