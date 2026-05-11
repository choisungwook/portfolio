# Chapter 8 — Network Co-Pilot

책 *AI Networking Cookbook* (Eric Chou, Packt 2026) Chapter 8을 따라간다. Recipe 8.1/8.2/8.3을 책 그대로 폴더 단위로 분리했다.

## 폴더 구조

| 폴더 | 책 Recipe | 무엇을 하는가 |
|---|---|---|
| `src/recipe_8_1/` | 8.1 | 같은 네트워킹 질문을 여러 모델에 던지고 1~10점 채점 |
| `src/recipe_8_2/` | 8.2 | device + network context + ai examples 를 prompt에 붙인 co-pilot v1 |
| `src/recipe_8_3/` | 8.3 | 8.2 위에 topology + templates + impact 분석을 더한 v2 |
| `mock_data/` | 공통 | 책의 mock JSON 5개 (devices/network_context/ai_examples/topology/templates) |
| `docs/` | — | 이론 정리 + 30분 시연 시나리오 |

## 빠른 실행

챕터 8은 외부 인프라(DB·웹서버)를 띄우지 않고 OpenAI API만 호출하므로 도커 없이 로컬에서 `uv` 로 바로 실행한다.

`.env` 준비하고 의존성 설치:

```bash
cp .env.example .env   # OPENAI_API_KEY 채우기
uv sync
```

Recipe 8.1 (모델 비교, 1회 실행 → 결과 JSON 3개):

```bash
uv run python src/recipe_8_1/run_all.py
```

Recipe 8.2 / 8.3 (대화형):

```bash
uv run python src/recipe_8_2/network_ai_engine.py    # v1 co-pilot
uv run python src/recipe_8_3/network_ai_engine_v2.py # v2 enhanced co-pilot
```

## 기본값

- OpenAI 모델은 비용 절약을 위해 `gpt-4.1-nano` 가 기본값. `.env`의 `OPENAI_MODEL` 또는 `EVAL_MODELS` 로 바꿀 수 있다.
- Python은 `uv` 로 의존성 관리, indent 2.

## 더 읽을 거리

- [theory](docs/theory.md) — raw LLM과 co-pilot의 차이, 컨텍스트 5단계
- [hands-on](docs/hands-on.md) — 발표용 30분 시연 시나리오
