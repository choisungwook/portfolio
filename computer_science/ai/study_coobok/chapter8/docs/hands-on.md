# Hands-On — Network Co-Pilot 30분 시연

발표 자리에서 그대로 따라가도 되는 시연 시나리오다. 도커와 OpenAI API key만 있으면 다른 준비물은 없다.

## 사전 준비

API key 가져오고 컨테이너 빌드:

```bash
cp .env.example .env   # OPENAI_API_KEY=sk-... 채우기
make build             # 첫 1회만, 이후 캐시 사용
```

## 시연 1 — context 없는 LLM과 차이 보여주기

ChatGPT 또는 OpenAI Playground에 그냥 질문을 던진다:

```
Configure OSPF on R1
```

답은 일반적인 Cisco IOS 가이드. R1이 무엇인지 모름.

이제 co-pilot에 같은 질문:

```bash
make chat
# you> Configure OSPF on R1
```

`[Device]` `[Topology]` `[Template]` `[Impact]` 가 시스템 프롬프트에 붙어 답이 *이 R1에 한정된* 형태로 돌아온다. **차이는 모델이 아니라 컨텍스트라는 점을 강조**한다.

## 시연 2 — topology 명령으로 컨텍스트 자체 보기

`topology` 입력:

```bash
you> topology
```

장비끼리 어떻게 연결됐는지 출력. 컨텍스트가 "어딘가의 신비한 데이터"가 아니라 우리 손에 있는 JSON임을 보여준다.

## 시연 3 — 영향 분석 (Impact)

스위치 다운 시나리오:

```bash
you> What happens if SW1 goes down?
```

`[Impact] changes may affect: R1, SW2`가 컨텍스트로 들어가서 답이 변경 위험도까지 짚는다.

## 시연 4 — 모델 비교 (Recipe 8.1)

옵션. nano 한 모델만 돌려도 된다. 여러 모델을 비교하고 싶을 때:

```bash
EVAL_MODELS=gpt-4.1-nano,gpt-4o-mini make evaluate
```

`SCORE: X - reason` 형태로 각 모델 답변이 채점된다. 결과 JSON이 작업 디렉터리에 떨어진다.

## 정리

`make down`으로 컨테이너 정리:

```bash
make down
```

## 자주 막히는 곳

- **`OPENAI_API_KEY가 비어 있습니다`**: `.env` 파일을 만들지 않았거나 placeholder를 그대로 둔 경우. `cp .env.example .env` 후 키 입력.
- **rate limit**: 8.1 evaluator가 모델당 3개 질문 × 채점 1회 호출이라 nano 기준으로도 문제없지만, 무료 티어면 `time.sleep`을 늘리는 식으로 조정.
