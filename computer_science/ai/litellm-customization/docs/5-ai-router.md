# 4단계. 로컬 소형 모델이 보낼 모델을 고르는 훅

## 이번 단계에서 배울 개념

- pre_call 훅에서 `data["model"]`을 바꾸면 Router는 바뀐 별칭으로 deployment를 고른다. 클라이언트는 항상 `claude`를 부르는데, gateway가 질문을 보고 `gemini`로 보낼 수 있다.
- 그 판단을 규칙 대신 **작은 LLM**에 맡긴다. 훅이 `litellm.proxy.proxy_server.llm_router`로 판정 전용 별칭(`router-judge`)을 부르고, 그 모델이 JSON 한 줄로 고른 별칭을 `data["model"]`에 넣는다. 판정 모델은 로컬 Ollama의 `gemma2:2b`이며 `num_gpu: 0`으로 CPU에서만 추론한다.
- 판정은 실패할 수 있다. 시간 초과, 연결 실패, 형식이 틀린 JSON이면 클라이언트가 요청한 모델을 그대로 쓴다. 판정 실패가 요청 실패로 번지지 않게 하는 것이 이 훅의 첫 번째 책임이다.

예제는 Q&A 챗봇이다. 코드 작성·디버깅·설계처럼 여러 단계 추론이 필요한 질문은 `claude`가, 잡담·추천·짧은 사실 질문은 `gemini`가 받는다고 가정한다. 두 별칭은 이름만 실제 제품을 흉내 낸 mock 모델이고, 실제 호출은 판정 모델(로컬 Ollama)에만 일어난다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| 판정 모델 | 질문에 답하지 않고 보낼 모델만 고르는 작은 LLM | `router-judge` (`ollama_chat/gemma2:2b`) |
| 모델 교체 | 훅이 요청의 `model` 필드를 다른 별칭으로 바꾸는 것 | `claude` → `gemini` |
| `num_gpu` | Ollama가 GPU에 올릴 layer 수. 0이면 CPU로만 추론한다 | `litellm_params.num_gpu: 0` |
| JSON mode | 응답을 JSON 객체로 강제하는 요청 옵션 | `response_format={"type": "json_object"}` |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | 훅 실행 전에 클라이언트가 보낸 `model`을 따로 저장한다 | `proxy/common_request_processing.py` | `ProxyBaseLLMRequestProcessing.base_process_llm_request` (`requested_model_from_client`) |
| 2 | pre_call 훅 체인을 실행하고, 반환된 dict로 `self.data`를 교체한다 | `proxy/common_request_processing.py` → `proxy/utils.py` | `common_processing_pre_call_logic` → `ProxyLogging.pre_call_hook` |
| 3 | 훅이 Proxy 기동 때 만든 Router로 판정 모델을 부른다. Router 자체에는 pre_call 훅 실행 단계가 없다 | `proxy/proxy_server.py`, `router_python_core.py` | 전역 `llm_router`, `PythonCore.acompletion` |
| 4 | 바뀐 `data["model"]`로 Router를 부른다 | `proxy/route_llm_request.py` | `route_request` |
| 5 | 응답 본문 `model`을 1번에서 저장한 값으로 덮어쓴다 | `proxy/common_request_processing.py` | `_override_openai_response_model` |

3번의 판정 호출은 Proxy endpoint를 거치지 않으므로 pre_call 훅이 다시 실행되지 않고, spend log 행도 따로 생기지 않는다. `llm_router`는 모듈 전역 변수라 훅 모듈 맨 위에서 import하면 import 시점의 값(`None`일 수 있다)이 고정된다. 그래서 [gateway/ai_router.py](../gateway/ai_router.py)의 `proxy_router()`는 호출할 때마다 다시 import한다.

1번과 5번 때문에 클라이언트 입장에서는 교체가 투명하다. 본문 `model`은 항상 `claude`라서, 실제로 답한 별칭은 응답 헤더 `x-litellm-model-group`이나 spend log로만 보인다. 그래서 훅이 판정 결과와 걸린 시간을 `spend_logs_metadata`에 남긴다.

## 코드와 config

[gateway/ai_router.py](../gateway/ai_router.py)의 핵심은 판정 모델을 시간 제한 안에서 부르는 `judge`와, 실패해도 요청을 그대로 넘기는 훅 본문이다.

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

판정 프롬프트는 영어로 썼고, 질문이 한국어여도 아래 실행에서 네 질문이 모두 의도대로 나뉘었다. `parse_choice`는 응답이 후보 별칭 둘 중 하나가 아니면 `ValueError`를 던져, 모델이 엉뚱한 이름을 만들어도 존재하지 않는 별칭으로 라우팅되지 않게 막는다. 시간 제한은 30초다. CPU 전용 판정이 10초를 넘기 때문이다.

[config/4-ai-router.yaml](../config/4-ai-router.yaml)은 mock 별칭 2개, 판정 모델 1개, 훅 하나를 등록한다.

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

`num_gpu`는 LiteLLM이 Ollama 요청의 `options`로 넘기는 값이다. `temperature: 0`은 같은 질문에 같은 판정이 나오게 하려고 둔다.

## 실행

Ollama와 `gemma2:2b`가 준비되어 있어야 하고([1-setup.md의 5번](1-setup.md)), Postgres가 떠 있어야 한다([1-setup.md의 4번](1-setup.md)).

### 1. Proxy 기동

판정 모델과 `AiRouter` 훅을 등록한 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/4-ai-router.yaml --port 4100
```

### 2. 질문 4개를 모두 claude로 요청

코드·설계 질문 2개와 일상·사실 질문 2개를 모두 `claude`로 보낸다. 반복문은 질문마다 본문의 `model`과 응답 내용, 응답 헤더의 `x-litellm-model-group`을 출력한다. 판정 한 번에 10초 이상 걸리므로 네 질문이 끝나기까지 1분 정도 걸린다.

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

질문마다 본문의 `model`과 헤더의 `x-litellm-model-group`을 비교한다.

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

판정 모델은 네 질문을 모두 의도대로 나눴다. 본문 `model`은 네 번 모두 `claude`라서, 실제로 답한 별칭은 헤더와 응답 내용에서만 드러난다.

### 3. 판정 모델이 CPU에서 돌았는지 확인

`num_gpu: 0`이 Ollama까지 전달됐는지는 Ollama가 지금 올려 둔 모델 목록으로 확인한다.

```bash
ollama ps
```

`PROCESSOR` 열을 본다.

```text
NAME         ID              SIZE      PROCESSOR    CONTEXT    UNTIL
gemma2:2b    8ccf136fdd52    2.1 GB    100% CPU     4096       4 minutes from now
```

`100% CPU`이면 GPU를 쓰지 않았다는 뜻이다. config에서 `num_gpu` 줄을 지우면 Apple Silicon에서는 Metal GPU로 올라간다.

### 4. spend log에 남은 판정 결과와 시간 확인

훅이 남긴 판정 결과와 걸린 시간을 보려고 최근 spend log 4행을 조회한다. 최신 행이 위에 온다.

```bash
docker compose exec -T postgres psql -U litellm -tAc \
  "select model_group, metadata->'spend_logs_metadata' from \"LiteLLM_SpendLogs\" order by \"startTime\" desc limit 4"
```

`model_group`과 마지막 칸의 판정 기록을 함께 본다. 시간 값은 실행마다 달라진다.

```text
claude|{"ai_router": "claude->claude in 17.7s"}
gemini|{"ai_router": "claude->gemini in 12.2s"}
gemini|{"ai_router": "claude->gemini in 13.4s"}
claude|{"ai_router": "claude->claude in 10.7s"}
```

판정 모델 호출은 행을 따로 만들지 않고, 판정 결과만 바깥 요청의 행에 남았다. 이 실행(Apple M3 Pro, CPU 전용)에서 판정 한 번은 10.7~17.7초 걸렸다. 응답을 만드는 모델이 mock이라 거의 0초이므로, 사용자가 기다린 시간은 사실상 전부 판정 시간이다.

## CPU 전용 판정의 Trade-off

| 관점 | CPU 전용 소형 모델 판정 | 키워드 규칙 |
|---|---|---|
| 판정 품질 | 의미를 본다. "데드락 원인 분석"과 "점심 메뉴"를 글자가 아니라 내용으로 나눴다 | 글자를 본다. "코드명"에 "코드"가 들어 있으면 거짓 양성이 된다 |
| 지연 | 이 실습에서 판정 한 번에 10~18초. 모든 요청에 더해진다 | 거의 0 |
| 비용 | provider 비용은 없지만 gateway 머신의 CPU를 판정 동안 점유한다 | 없음 |
| 실패 처리 | 시간 초과·형식 오류를 흡수하는 코드가 필요하다 | 실패할 일이 없다 |
| 하드웨어 의존 | GPU가 있으면 같은 모델이 수십 배 빨라진다 | 없음 |

CPU 전용은 GPU 없는 서버에서도 똑같이 재현된다는 장점이 있지만, 이 지연을 대화형 챗봇의 모든 요청에 더하기는 어렵다. 실제로 이 구조를 쓰려면 판정 결과를 캐시하거나, 확실한 질문은 규칙으로 먼저 거르거나, 판정 모델만 GPU에 두는 식으로 판정 횟수나 시간을 줄여야 한다. 다음 5단계의 LiteLLM 내장 `complexity_router`가 이 조합(키워드 규칙, LLM 분류기, 실패 시 로컬 점수)을 config로 제공한다.

## 단위 테스트

[tests/test_4_ai_router.py](../tests/test_4_ai_router.py)는 판정 모델 대신 정해진 content로 답하는 fake Router를 주입한다. Ollama 없이 돌며, 판정이 실패하는 경로를 고정하는 데 집중한다.

| 테스트 | 확인하는 것 |
|---|---|
| `test_judge_choice_replaces_model_and_is_recorded` | 판정 결과로 `model`이 바뀌고, 판정 모델 별칭으로 호출했으며, 결과가 spend log에 남는다 |
| `test_unknown_choice_keeps_requested_model` | 후보가 아닌 별칭을 고르면 요청 모델을 유지한다 |
| `test_slow_judge_keeps_requested_model` | 판정이 시간 제한을 넘기면 요청 모델을 유지한다 |
| `test_parse_choice_rejects_non_json` | JSON이 아닌 응답은 `ValueError`가 된다 |

아래 명령은 이 테스트 파일만 실행한다.

```bash
uv run pytest tests/test_4_ai_router.py
```

마지막 줄에서 네 테스트가 모두 통과했는지 본다.

```text
....                                                                     [100%]
4 passed
```

## 실험 과제

config에서 `num_gpu: 0` 줄을 지우고 Proxy를 다시 띄운 뒤 같은 네 질문을 보낸다. `ollama ps`의 `PROCESSOR`가 어떻게 바뀌는지, spend log의 판정 시간이 몇 배 줄어드는지, 판정 결과는 그대로인지 확인한다.
