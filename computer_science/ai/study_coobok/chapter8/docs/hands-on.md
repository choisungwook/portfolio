# Hands-On — 30분 시연 시나리오

발표 자리에서 그대로 따라가도 되는 시나리오다. Python 3.11+ 와 `uv`, OpenAI API key만 있으면 된다. 챕터 8은 외부 인프라가 없어서 도커도 띄우지 않는다.

## 사전 준비

API key 입력하고 의존성 설치:

```bash
cp .env.example .env   # OPENAI_API_KEY=sk-... 채우기
uv sync
```

이후 모든 명령은 `chapter8/` 루트에서 실행한다 (mock_data 경로가 그 기준).

## 시연 1 — Recipe 8.1, "모델보다 컨텍스트"

같은 네트워킹 질문 3개를 cheap/mid 모델 3개(`gpt-4.1-nano`, `gpt-4o-mini`, `gpt-4.1-mini`)에 던지고 nano 모델로 채점한다:

```bash
uv run python src/recipe_8_1/run_all.py
```

`model_test_results.json` 에 모델 응답이, `response_evaluations.json` 에 점수가, `model_summary.json` 에 best 모델이 chapter8 루트에 떨어진다. 발표 포인트는 "비싼 모델이라고 점수가 크게 더 좋지 않다 → 그러니 다음 단계는 모델이 아니라 컨텍스트를 늘리는 쪽"이라는 흐름이다.

step 단위로 따로 보고 싶으면:

```bash
uv run python src/recipe_8_1/1_test_models.py
uv run python src/recipe_8_1/2_evaluate_responses.py
uv run python src/recipe_8_1/3_analysis.py
```

비교 대상을 다른 조합으로 바꾸고 싶으면 한 줄로 (2개 이상 필수):

```bash
EVAL_MODELS=gpt-4.1-nano,gpt-4o uv run python src/recipe_8_1/run_all.py
```

## 시연 2 — Recipe 8.2, context 없는 LLM과 차이 보여주기

ChatGPT(또는 OpenAI Playground)에 그냥 질문을 던진다:

```text
Configure OSPF on R1
```

답은 일반적인 Cisco IOS 가이드. R1이 무엇인지 모름.

이제 co-pilot v1에 같은 질문:

```bash
uv run python src/recipe_8_2/network_ai_engine.py
# You: Configure OSPF on R1
```

답에 R1의 모델/위치/연결 장비가 반영된다. **차이는 모델이 아니라 컨텍스트라는 점이 핵심**.

## 시연 3 — Recipe 8.3, topology + impact

스위치 다운 시나리오:

```bash
uv run python src/recipe_8_3/network_ai_engine_v2.py
# You: topology       # 연결관계 그대로 출력
# You: What happens if SW1 goes down?
```

`Impact Analysis` 가 prompt에 붙어 답이 변경 위험도까지 짚는다. v1에는 없던 답변이다.

설정 변경에서는 templates가 끼어든다:

```text
You: Configure OSPF area 0 on R1
```

`Template available: interface {interface}\n ip ospf {process_id} area {area}` 같은 회사 표준 스니펫이 prompt에 들어가 답이 사내 컨벤션을 따른다.

## 정리

대화형 세션은 `quit` 입력으로 종료한다. 결과 JSON 파일이 남았다면 그대로 두고 다음 발표 때 비교 자료로 써도 되고, `.gitignore` 에 등록되어 있으니 커밋되지 않는다.

## 자주 막히는 곳

- **`OPENAI_API_KEY` 가 비어 있다**: `.env` 를 만들지 않았거나 placeholder를 안 바꿈. `cp .env.example .env` 후 키 입력.
- **rate limit**: 8.1 은 모델당 3개 질문 + 채점 1회 호출이라 nano 기준으로 문제없지만, 무료 티어면 `1_test_models.py` 의 `time.sleep` 을 늘려도 된다.
- **mock_data 못 찾음**: 반드시 `chapter8/` 루트에서 명령을 실행한다. 스크립트가 `chapter8/mock_data/` 를 상대경로로 찾는다.
