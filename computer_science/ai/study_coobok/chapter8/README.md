# Chapter 8 — Network Co-Pilot

## 글쓴이의 의도

LLM 단독으로는 네트워크 엔지니어의 질문에 정답을 못 한다. 우리 회사의 R1이 어디에 있는지, SW1이 누구와 연결됐는지, 우리가 OSPF area를 어떻게 쓰는지 모르기 때문이다. 챕터 8은 "raw LLM에 컨텍스트(장비 카탈로그, 토폴로지, 설정 템플릿)를 주입하면 co-pilot이 된다"를 시연한다. Recipe 8.1은 같은 질문을 여러 모델에 던져 비교하고, 8.2/8.3은 컨텍스트를 점점 풍부하게 쌓아 답변 품질을 끌어올린다.

## 어떻게 구현했는가

세 Recipe를 하나의 `network_copilot` 패키지로 합쳤다. 8.1은 `evaluator` 모듈로, 8.2/8.3은 `copilot` + `context` 모듈로 분리했다. 컨텍스트 빌더(`context.py`)는 **장비 매칭 → 토폴로지 → 영향 범위 → 설정 템플릿 → 예시**를 한 묶음으로 조립해서 시스템 프롬프트에 붙인다. OpenAI 모델은 비용 절약을 위해 `gpt-4.1-nano` 기본값. 실행은 `docker compose run`으로 통일한다.

## 빠른 시작

`.env` 만들고 docker compose로 chat 시작:

```bash
cp .env.example .env  # OPENAI_API_KEY 입력
make chat             # docker compose run --rm copilot
```

8.1 모델 비교만 돌리고 싶을 때:

```bash
make evaluate         # docker compose --profile eval run --rm evaluate
```

## 더 읽을 거리

- [theory](docs/theory.md) — co-pilot이 raw LLM과 다른 이유
- [hands-on](docs/hands-on.md) — 발표 시연용 30분 실습
