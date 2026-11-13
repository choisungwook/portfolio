# 5단계. 내장 complexity_router로 tier 라우팅

## 이번 단계에서 배울 개념

- 4단계에서 훅으로 직접 만든 "판단해서 모델 고르기"를 LiteLLM은 `auto_router/complexity_router`라는 가짜 모델로 내장한다. 클라이언트가 `smart-router`를 부르면 Router가 deployment를 고르기 전에 질문을 SIMPLE, MEDIUM, COMPLEX, REASONING 네 tier 중 하나로 분류하고, tier마다 정해 둔 별칭으로 보낸다. 훅 코드가 없고 config만 있다.
- 분류는 순서가 정해진 여러 단계로 이뤄진다. **키워드 규칙**(`keyword_tier_rules`)이 먼저 걸리면 그 tier로 끝나고, 아니면 `classifier_type`이 정한 분류기가 돈다. 기본값 `heuristic`은 모델을 부르지 않고 글자 수, 코드 여부, 추론 표지어 같은 신호로 점수를 매긴다. `llm`은 4단계처럼 작은 모델에 tier를 묻고, 그 호출이 실패하면 휴리스틱으로 돌아간다(`classifier_fallback`).
- LiteLLM 공식 문서는 이 기능을 Auto Routing이라 부르고, 예전 의미 기반 Auto Router를 deprecated로 표시하며 이쪽으로 통합하는 중이다. 이 실습은 `complexity_router`만 다룬다.

### 용어

| 용어 | 뜻 | 이 실습의 예 |
|---|---|---|
| tier | 질문의 복잡도 등급 | SIMPLE, MEDIUM → `gemini`, COMPLEX, REASONING → `claude` |
| heuristic scorer | 모델 호출 없이 신호로 점수를 매기는 로컬 분류기 | `score: -0.1` → SIMPLE |
| keyword_tier_rules | 분류기보다 먼저 보는 키워드 → tier 규칙. 여러 규칙이 걸리면 더 높은 tier가 이긴다 | `asyncio` → COMPLEX |
| LLM classifier | 작은 모델에게 tier를 묻는 분류기 | `router-judge` (4단계와 같은 `gemma2:2b`, CPU 전용) |
| circuit breaker | 분류 호출이 실패하면 일정 시간 분류기를 부르지 않고 휴리스틱으로 바로 가는 장치 | 기본 30초 |
| JEV | TypeSafe의 분류 API를 쓰는 `classifier_type: oss_classifier`. 이 버전에서는 `TYPESAFE_API_KEY`로 호스팅 API를 부른다 | 이 실습에서는 쓰지 않는다 |

## LiteLLM 내부에서 일어나는 위치

| 순서 | 동작 | 소스 경로 | 함수 |
|---|---|---|---|
| 1 | `model`이 `auto_router/complexity_router`로 시작하는 deployment를 ComplexityRouter로 초기화한다 | `router_python_core.py` | `_is_complexity_router_deployment` → `init_complexity_router_deployment` |
| 2 | `smart-router` 요청은 deployment 선택 전에 분류·라우팅 단계를 거친다 | `router_strategy/complexity_router/complexity_router.py` | `ComplexityRouter.async_pre_routing_hook` → `_classify_and_route` |
| 3 | 키워드 규칙을 먼저 본다. 공백이 있거나 CJK 문자가 든 키워드는 부분 문자열로, 나머지는 단어 경계(`\b`)로 비교한다 | 같은 파일 | `_lexical_tier_override` → `_keyword_matches` |
| 4 | `classifier_type`에 따라 분류기를 고른다 | 같은 파일 | `aclassify` |
| 5 | LLM 분류가 실패하거나 circuit이 열려 있으면 휴리스틱 점수로 정한다 | 같은 파일 | `_llm_classifier_outcome` |
| 6 | tier, 분류 출처(cause), 점수를 응답 헤더로 내보낸다 | `litellm_core_utils/add_retry_fallback_headers.py` | `x-litellm-complexity-router-` 접두사 |

3번의 CJK 판정 정규식(`_CJK_CHARACTER`)은 한자, 히라가나, 가타카나만 포함하고 **한글은 포함하지 않는다**. 그래서 한글 키워드는 단어 경계로 비교되고, 조사가 붙은 `데드락이`는 `데드락` 규칙에 걸리지 않는다. 아래 실행 2번에서 이 동작을 확인한다.

## 코드와 config

이 단계는 Python 코드가 없고 config 두 개로 분류기를 비교한다.

[config/5-complexity-heuristic.yaml](../config/5-complexity-heuristic.yaml)은 휴리스틱과 키워드 규칙만 쓴다.

```yaml
  - model_name: smart-router
    litellm_params:
      model: auto_router/complexity_router
      complexity_router_config:
        tiers:
          SIMPLE: gemini
          MEDIUM: gemini
          COMPLEX: claude
          REASONING: claude
        keyword_tier_rules:
          - keywords: ["데드락"]
            tier: REASONING
          - keywords: ["asyncio"]
            tier: COMPLEX
      complexity_router_default_model: gemini
```

[config/5-complexity-llm.yaml](../config/5-complexity-llm.yaml)은 분류기를 4단계의 판정 모델로 바꾼다. tier와 `claude`, `gemini` 별칭은 위와 같고, 4단계의 `router-judge` 별칭을 더했으며, 분류기 판정만 보려고 `keyword_tier_rules`는 넣지 않았다.

```yaml
        classifier_type: llm
        classifier_llm_config:
          model: router-judge
          timeout_ms: 30000
        classifier_fallback: heuristic
```

`timeout_ms` 기본값은 3000(3초)이다. 4단계에서 CPU 전용 판정이 10초를 넘었으므로 30초로 늘렸다.

## 실행

Postgres가 떠 있어야 하고([1-setup.md의 4번](1-setup.md)), `llm` config는 Ollama와 `gemma2:2b`가 필요하다([1-setup.md의 5번](1-setup.md)).

### 1. 휴리스틱 config로 Proxy 기동

분류 호출 없이 휴리스틱과 키워드 규칙만 쓰는 config로 Proxy를 띄운다.

```bash
uv run --env-file .env litellm --config config/5-complexity-heuristic.yaml --port 4100
```

### 2. 질문 4개를 smart-router로 요청

4단계의 한국어 질문 3개에 영어로 쓴 설계 질문 하나를 더해 `smart-router`로 보낸다. 반복문은 본문과 함께 `x-litellm-complexity-router-`로 시작하는 헤더를 출력한다.

```bash
for q in "파이썬 asyncio 코드에서 데드락이 나는 원인을 분석해줘" "오늘 점심 메뉴 추천해줘" "대한민국 수도는 어디야?" "Explain step by step how to design a sharded order service, then compare it with a monolith"; do
  echo "Q: $q"
  curl -s -D /tmp/h.txt localhost:4100/v1/chat/completions \
    -H "Authorization: Bearer sk-local-master-key" -H "Content-Type: application/json" \
    -d "{\"model\": \"smart-router\", \"messages\": [{\"role\": \"user\", \"content\": \"$q\"}]}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['model'], '|', d['choices'][0]['message']['content'])"
  grep -i x-litellm-complexity-router /tmp/h.txt
done
```

질문마다 `tier`와 `cause`를 본다.

```text
Q: 파이썬 asyncio 코드에서 데드락이 나는 원인을 분석해줘
smart-router | claude 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: COMPLEX
x-litellm-complexity-router-cause: literal_keyword_match
Q: 오늘 점심 메뉴 추천해줘
smart-router | gemini 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: SIMPLE
x-litellm-complexity-router-cause: heuristic_scorer
x-litellm-complexity-router-score: -0.1
Q: 대한민국 수도는 어디야?
smart-router | gemini 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: SIMPLE
x-litellm-complexity-router-cause: heuristic_scorer
x-litellm-complexity-router-score: -0.1
Q: Explain step by step how to design a sharded order service, then compare it with a monolith
smart-router | gemini 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: MEDIUM
x-litellm-complexity-router-cause: heuristic_scorer
x-litellm-complexity-router-score: 0.175
```

첫 질문은 키워드 규칙으로 `claude`에 갔지만 tier가 REASONING이 아니라 COMPLEX다. 두 규칙 중 더 높은 tier가 이기므로 `데드락` 규칙이 걸렸다면 REASONING이어야 한다. 위 내부 표 3번대로 한글 키워드가 단어 경계로 비교되어 `데드락이`를 놓쳤고, 공백으로 떨어진 `asyncio`만 걸렸다. 한국어 키워드를 쓰려면 `"데드락이"`처럼 조사가 붙은 형태까지 나열하거나, 공백이 든 구(phrase)로 쓰거나, 임베딩 비교(`semantic_keyword_matching`)를 켜야 한다.

나머지 세 질문은 휴리스틱이 정했다. 한국어 질문 둘은 같은 점수(-0.1)로 SIMPLE이 됐고, 영어 설계 질문은 "step by step"과 비교 요청이 있었는데도 MEDIUM에 그쳐 `gemini`로 갔다. 휴리스틱은 질문의 난이도가 아니라 어휘 신호를 세기 때문에, 신호어가 적은 언어나 짧은 문장에서는 거의 구분하지 못한다.


Proxy를 `Ctrl+C`로 끄고 LLM 분류기 config로 다시 띄운다.

```bash
uv run --env-file .env litellm --config config/5-complexity-llm.yaml --port 4100
```

2번의 반복문을 그대로 다시 실행한다. 분류 한 번에 10초 이상 걸리므로 네 질문이 끝나기까지 1분 이상 걸린다.

```text
Q: 파이썬 asyncio 코드에서 데드락이 나는 원인을 분석해줘
smart-router | claude 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: COMPLEX
x-litellm-complexity-router-cause: llm_classifier
Q: 오늘 점심 메뉴 추천해줘
smart-router | gemini 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: SIMPLE
x-litellm-complexity-router-cause: llm_classifier
Q: 대한민국 수도는 어디야?
smart-router | gemini 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: SIMPLE
x-litellm-complexity-router-cause: llm_classifier
Q: Explain step by step how to design a sharded order service, then compare it with a monolith
smart-router | claude 별칭의 mock 응답입니다.
x-litellm-complexity-router-tier: COMPLEX
x-litellm-complexity-router-cause: llm_classifier
```

이 config에는 키워드 규칙이 없으므로 첫 질문도 분류기가 정했다. 네 질문 모두 `cause`가 `llm_classifier`이고, 휴리스틱이 MEDIUM으로 본 영어 설계 질문도 COMPLEX로 `claude`에 갔다. 4단계 훅과 같은 판정 모델을 썼고 결과도 같은 방향이다. 이 실행에서 요청 하나의 총 시간은 15.8~21.6초였다. 4단계 훅보다 조금 더 걸렸는데, 내장 분류기 프롬프트가 tier 네 개를 설명하느라 4단계의 두 줄짜리 판정 프롬프트보다 길기 때문으로 보인다(원인은 측정하지 않았다).

### 4. 시간 제한을 기본값으로 줄였을 때의 폴백

`config/5-complexity-llm.yaml`의 `timeout_ms: 30000`을 기본값과 같은 `3000`으로 바꾸고 Proxy를 다시 띄운 뒤 2번의 반복문을 실행한다. CPU 판정은 3초 안에 끝나지 않는다.

네 질문 모두 `cause`가 `heuristic_scorer`로 바뀌고 응답은 바로 온다. 이유는 Proxy 로그에 남는다.

```text
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier failed (TimeoutError), falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
```

첫 질문만 3초를 기다린 뒤 시간 초과로 휴리스틱에 넘어갔고, 그 순간 circuit이 열려 나머지 질문은 분류 모델을 부르지도 않았다. circuit은 `circuit_breaker_cooldown_seconds`(기본 30초) 뒤에 다시 닫힌다. 4단계 훅은 판정이 실패할 때마다 시간 제한만큼 기다렸지만, 내장 분류기는 실패를 기억해 다음 요청의 지연을 막는다.

## 직접 만든 훅과 내장 complexity_router 비교

| 관점 | 4단계 훅 (`AiRouter`) | 내장 `complexity_router` |
|---|---|---|
| 코드 | 훅 클래스와 테스트를 직접 유지한다 | config만 있다 |
| 출력 | 후보 별칭 하나를 직접 고른다 | 네 tier 중 하나를 고르고, tier → 별칭은 config가 정한다 |
| 판정 전 규칙 | 직접 구현해야 한다 | `keyword_tier_rules`. 한글 키워드는 단어 경계 비교라 조사에 약하다 |
| 실패 처리 | 요청 모델을 유지한다. 실패할 때마다 시간 제한만큼 기다린다 | 휴리스틱으로 넘어가고 circuit breaker가 이후 지연을 막는다 |
| 관측 | 훅이 `spend_logs_metadata`에 직접 남긴다 | tier, cause, score가 응답 헤더로 나온다 |
| 판정 기준 바꾸기 | 프롬프트와 후보를 자유롭게 바꾼다 | `classification_prompt`, `tier_definitions`로 바꾼다 |

라우팅 기준이 "복잡도"라면 내장 기능이 코드 없이 실패 처리까지 제공하므로 먼저 검토할 만하다. 기준이 복잡도가 아니라 팀, 데이터 민감도, 제품 기능처럼 이 tier 체계에 맞지 않는다면 4단계처럼 훅으로 직접 만들거나 `classifier_type: custom` 플러그인을 쓴다.

같은 구성을 공개적으로 운영한 사례도 있다. AWS Builder Center의 [Three-tier model routing on Amazon Bedrock with LiteLLM](https://builder.aws.com/content/3K9vGsFlfOVO9azNe0I3JuiFgRC/three-tier-model-routing-on-amazon-bedrock-with-litellm)(2026-10)은 `complexity_router`와 `classifier_type: llm`으로 Bedrock 모델 세 tier를 나누고, 분류기 시간 초과로 circuit이 열려 일부 요청이 휴리스틱으로 넘어간 결과를 보고한다.

## 확인 방법

이 단계는 Python 코드가 없어 단위 테스트를 추가하지 않았다. 위 실행 2·3·4번의 헤더와 로그로 확인한다.

## 실험 과제

휴리스틱 config의 `데드락` 규칙을 `keywords: ["데드락이"]`로 바꾸고 Proxy를 다시 띄운 뒤 첫 질문을 보낸다. tier가 REASONING으로 바뀌는지, 그리고 "데드락을 설명해줘"처럼 조사가 다른 질문은 다시 놓치는지 확인한다.
