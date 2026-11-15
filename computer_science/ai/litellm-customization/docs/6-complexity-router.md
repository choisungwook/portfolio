# 5단계. 내장 complexity_router로 tier 라우팅

## 이번 단계에서 배울 개념

- **내장 Auto Routing (`complexity_router`)**: 4단계에서 훅 코드로 직접 구현했던 "질문 난이도 판정 후 모델 선택" 기능을 LiteLLM은 `auto_router/complexity_router`라는 내장 모델 타입으로 제공한다. 클라이언트가 `smart-router`를 호출하면 Router가 deployment를 고르기 전에 질문을 `SIMPLE`, `MEDIUM`, `COMPLEX`, `REASONING` 네 tier 중 하나로 분류하고, 각 tier에 매핑된 별칭으로 요청을 전달한다. Python 훅 코드 없이 설정 파일만으로 동작한다.
- **다단계 분류 파이프라인**: 분류는 우선순위가 정해진 단계별로 진행된다. 먼저 **키워드 규칙**(`keyword_tier_rules`)에 일치하면 해당 tier로 즉시 확정되고, 일치하지 않으면 `classifier_type`에 지정된 분류기가 실행된다. 기본값인 `heuristic`은 외부 모델을 호출하지 않고 문장 길이, 코드 블록 여부, 추론 표지어 등의 신호로 점수를 계산한다. `llm`을 선택하면 4단계처럼 소형 모델에 tier 판정을 요청하며, 호출 실패 시에는 `classifier_fallback` 설정에 따라 휴리스틱으로 전환된다.
- **기능 통합 현황**: LiteLLM 공식 문서는 이 기능을 Auto Routing으로 안내하며, 기존의 임베딩 기반 Auto Router를 deprecated로 표시하고 `complexity_router` 중심으로 통합하고 있다. 이 실습은 `complexity_router`만 다룬다.

### 용어 정리

| 용어 | 설명 | 이 실습의 예 |
| --- | --- | --- |
| tier | 질문의 복잡도 등급 | `SIMPLE`, `MEDIUM` → `gemini` / `COMPLEX`, `REASONING` → `claude` |
| heuristic scorer | 모델 호출 없이 어휘·구조 신호로 복잡도 점수를 매기는 로컬 분류기 | `score: -0.1` → `SIMPLE` |
| `keyword_tier_rules` | 분류기보다 먼저 평가하는 키워드 → tier 매핑 규칙 (복수 매칭 시 상위 tier 우선) | `asyncio` → `COMPLEX` |
| LLM classifier | 소형 모델에 질문을 보내 tier를 판정받는 분류기 | `router-judge` (4단계와 동일한 `gemma2:2b`, CPU 전용) |
| circuit breaker | 분류 호출 실패 시 일정 시간 동안 분류기 호출을 차단하고 휴리스틱으로 우회하는 보호 장치 | 기본 cooldown 30초 |
| JEV | TypeSafe 호스팅 분류 API를 사용하는 `classifier_type: oss_classifier` (`TYPESAFE_API_KEY` 필요) | 이 실습에서는 미사용 |

## LiteLLM 내부 동작 위치

| 순서 | 동작 | 소스 경로 | 함수 |
| --- | --- | --- | --- |
| 1 | `model`이 `auto_router/complexity_router`로 시작하는 deployment를 `ComplexityRouter`로 초기화한다 | `router_python_core.py` | `_is_complexity_router_deployment` → `init_complexity_router_deployment` |
| 2 | `smart-router` 요청은 deployment 선택 직전에 분류·라우팅 훅을 거친다 | `router_strategy/complexity_router/complexity_router.py` | `ComplexityRouter.async_pre_routing_hook` → `_classify_and_route` |
| 3 | 키워드 규칙을 먼저 평가한다 (공백 또는 CJK 문자 포함 시 부분 문자열 매칭, 그 외는 단어 경계 `\b` 매칭) | 같은 파일 | `_lexical_tier_override` → `_keyword_matches` |
| 4 | `classifier_type` 설정에 따라 적절한 분류기를 실행한다 | 같은 파일 | `aclassify` |
| 5 | LLM 분류가 실패하거나 circuit이 열려 있으면 휴리스틱 점수로 폴백한다 | 같은 파일 | `_llm_classifier_outcome` |
| 6 | 결정된 tier, 분류 출처(cause), 점수를 응답 헤더로 출력한다 | `litellm_core_utils/add_retry_fallback_headers.py` | `x-litellm-complexity-router-` 접두사 헤더 |

3번 단계의 CJK 판정 정규식(`_CJK_CHARACTER`)에는 한자, 히라가나, 가타카나만 포함되어 있고 **한글은 빠져 있다.** 그 결과 한글 키워드는 공백이나 구두점 기준의 단어 경계(`\b`)로 비교되므로, `"데드락"` 규칙을 두더라도 `"데드락이"`처럼 조사가 붙은 단어는 매칭되지 않는다. 아래 실행 2번에서 이 동작을 직접 확인한다.

## 코드 및 설정

이 단계는 별도 Python 코드 없이 설정 파일 두 개로 `heuristic` 분류기와 `llm` 분류기의 차이를 비교한다.

아래는 [config/5-complexity-heuristic.yaml](../config/5-complexity-heuristic.yaml)에서 휴리스틱과 키워드 규칙을 정의한 `smart-router` 설정 부분이다.

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

[config/5-complexity-llm.yaml](../config/5-complexity-llm.yaml)은 분류기를 4단계의 판정 모델로 교체한 설정이다. `tiers`와 `claude`, `gemini` 별칭은 위와 동일하며 `router-judge` 별칭을 추가했다. 순수 분류기 판정 결과를 관찰하기 위해 `keyword_tier_rules`는 제외했다.

```yaml
        classifier_type: llm
        classifier_llm_config:
          model: router-judge
          timeout_ms: 30000
        classifier_fallback: heuristic
```

`timeout_ms`의 기본값은 3000(3초)이다. 4단계에서 확인했듯 CPU 전용 추론은 10초 이상 걸리므로 30000(30초)으로 늘려 두었다.

## 실행 및 검증

이 단계를 실행하려면 Postgres([1-setup.md의 4번](1-setup.md#4-postgres-기동-3단계부터))가 기동되어 있어야 하며, `llm` 설정 실습 시에는 Ollama와 `gemma2:2b`([1-setup.md의 5번](1-setup.md#5-ollama-판정-모델-준비-4단계부터))가 추가로 필요하다.

### 1. 휴리스틱 설정으로 Proxy 기동

외부 분류 모델 호출 없이 휴리스틱 점수와 키워드 규칙만 사용하는 `config/5-complexity-heuristic.yaml`로 Proxy를 기동한다.

```bash
uv run --env-file .env litellm --config config/5-complexity-heuristic.yaml --port 4100
```

### 2. 질문 4종을 smart-router로 요청

4단계에서 사용한 한국어 질문 3개에 영어로 작성한 설계 질문 1개를 더해 `smart-router`로 전송한다. 반복문은 응답 본문과 함께 `x-litellm-complexity-router-` 접두사 헤더를 출력한다.

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

질문마다 응답 헤더에 기록된 `tier`와 `cause` 값을 확인한다.

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

첫 번째 질문은 키워드 규칙으로 `claude`에 배정되었지만 tier가 `REASONING`이 아니라 `COMPLEX`다. 복수 규칙이 매칭되면 더 높은 tier가 우선하므로 `"데드락"` 규칙이 작동했다면 `REASONING`이어야 한다. 앞서 내부 동작 표 3번에서 설명한 대로 한글 키워드가 단어 경계로 비교되어 `"데드락이"`를 놓쳤고, 공백으로 분리된 `"asyncio"`만 일치했기 때문이다. 한국어 키워드 규칙을 안정적으로 쓰려면 `"데드락이"`처럼 조사가 붙은 변형을 함께 나열하거나, 공백이 포함된 구(phrase)로 등록하거나, 임베딩 기반 매칭(`semantic_keyword_matching`)을 활성화해야 한다.

나머지 세 질문은 휴리스틱 점수로 분류되었다. 한국어 질문 두 개는 동일한 점수(-0.1)로 `SIMPLE`이 되었고, 영어 설계 질문은 `"step by step"`과 비교 요청이 포함되었는데도 `MEDIUM`에 머물러 `gemini`로 라우팅되었다. 휴리스틱 분류기는 문장의 의미적 난이도가 아니라 영미권 어휘 신호를 기반으로 점수를 매기므로, 신호어가 적은 한국어나 짧은 문장에서는 변별력이 떨어진다.

### 3. LLM 분류기 설정으로 재요청

실행 중인 Proxy를 `Ctrl+C`로 종료하고 LLM 분류기 설정으로 다시 기동한다.

```bash
uv run --env-file .env litellm --config config/5-complexity-llm.yaml --port 4100
```

2번에서 사용한 반복문을 그대로 다시 실행한다. 분류 1회당 10초 이상 걸리므로 전체 완료까지 1분 이상 소요된다.

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

이 설정에는 키워드 규칙이 없으므로 첫 번째 질문 역시 분류기가 직접 판단했다. 네 질문 모두 `cause`가 `llm_classifier`로 찍혔으며, 휴리스틱이 `MEDIUM`으로 분류했던 영어 설계 질문도 `COMPLEX`로 판정되어 `claude`로 라우팅되었다. 4단계 훅과 동일한 판정 모델을 사용했기 때문에 분류 경향도 같다. 요청 1건당 총 소요 시간은 15.8~21.6초로 4단계 훅보다 약간 길었는데, 이는 내장 분류기 프롬프트가 네 개 tier 정의를 포함하느라 4단계의 짧은 프롬프트보다 토큰 수가 많기 때문으로 추정된다.

### 4. 타임아웃을 기본값으로 축소했을 때의 폴백 및 circuit breaker 동작

`config/5-complexity-llm.yaml`의 `timeout_ms: 30000`을 기본값인 `3000`으로 줄이고 Proxy를 재기동한 뒤 2번의 반복문을 실행한다. CPU 전용 판정은 3초 안에 완료될 수 없다.

실행 결과 네 질문 모두 `cause`가 `heuristic_scorer`로 전환되며 응답이 지연 없이 즉시 반환된다. 그 원인은 Proxy 서버 로그에서 확인할 수 있다.

```text
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier failed (TimeoutError), falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
LiteLLM Router:WARNING: complexity_router.py:2541 - ComplexityRouter: LLM classifier circuit is open, falling back to heuristic
```

첫 번째 질문만 3초를 대기한 뒤 `TimeoutError`로 인해 휴리스틱으로 폴백되었고, 그 즉시 circuit이 열려(`open`) 이후 세 질문은 LLM 분류기를 호출조차 하지 않고 바로 휴리스틱으로 넘어갔다. 열린 circuit은 `circuit_breaker_cooldown_seconds`(기본 30초)가 지나면 다시 닫힌다. 4단계에서 직접 구현한 훅은 판정이 실패할 때마다 매 요청마다 타임아웃만큼 대기했으나, 내장 분류기는 circuit breaker를 통해 연속 지연을 자동으로 차단한다.

## 직접 만든 훅과 내장 complexity_router 비교

| 관점 | 4단계 커스텀 훅 (`AiRouter`) | 내장 `complexity_router` |
| --- | --- | --- |
| 유지보수 대상 | Python 훅 클래스와 단위 테스트를 직접 관리 | YAML 설정만 관리 |
| 출력 형태 | 후보 별칭 중 하나를 직접 선택 | 네 tier 중 하나를 분류하고, tier → 별칭 매핑은 설정으로 분리 |
| 사전 규칙 | 코드로 직접 분기 구현 필요 | `keyword_tier_rules` 제공 (단, 한글 키워드는 단어 경계 비교 한계 존재) |
| 실패 대응 | 요청 원본 모델 유지 (실패마다 타임아웃만큼 지연) | 휴리스틱으로 자동 폴백하며 circuit breaker로 후속 지연 차단 |
| 관측성 | 훅이 `spend_logs_metadata`에 직접 기록 | tier, cause, score를 `x-litellm-complexity-router-*` 응답 헤더로 노출 |
| 기준 커스터마이징 | 프롬프트와 후보군을 자유롭게 변경 | `classification_prompt`, `tier_definitions` 설정으로 조정 |

라우팅 기준이 "질문 복잡도"라면 코드 작성 없이 폴백과 circuit breaker까지 제공하는 내장 기능을 우선 검토하는 편이 유리하다. 반면 팀·테넌트 구분, 데이터 민감도, 특정 제품 기능처럼 이 4단계 tier 체계에 맞지 않는 기준이 필요하다면 4단계처럼 pre_call 훅을 직접 작성하거나 `classifier_type: custom` 플러그인을 구현해야 한다.

이와 유사한 구성을 운영 환경에 적용한 공개 사례도 있다. AWS Builder Center의 [Three-tier model routing on Amazon Bedrock with LiteLLM](https://builder.aws.com/content/3K9vGsFlfOVO9azNe0I3JuiFgRC/three-tier-model-routing-on-amazon-bedrock-with-litellm)(2026-10)은 `complexity_router`와 `classifier_type: llm`으로 Bedrock 모델 세 tier를 구성하고, 분류기 타임아웃으로 circuit이 열려 일부 요청이 휴리스틱으로 전환된 운영 경험을 보고한다.

## 확인 방법

이 단계는 별도 Python 코드를 추가하지 않았으므로 단위 테스트 파일이 없다. 위 실행 2·3·4번의 응답 헤더와 Proxy 로그 출력으로 동작을 검증한다.

## 실험 과제

휴리스틱 설정 파일(`config/5-complexity-heuristic.yaml`)의 `데드락` 규칙을 `keywords: ["데드락이"]`로 수정하고 Proxy를 재기동한 뒤 첫 번째 질문을 다시 보낸다. tier가 `REASONING`으로 상향되는지, 그리고 `"데드락을 설명해줘"`처럼 다른 조사가 붙은 질문은 다시 매칭에 실패하는지 확인한다.
