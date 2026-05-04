# Theory — 왜 컨텍스트를 얹으면 LLM이 co-pilot이 되는가

## 문제: raw LLM은 "우리 R1"을 모른다

ChatGPT에게 "Configure OSPF on R1" 이라고 물으면 일반적인 Cisco IOS 명령을 돌려준다. 답은 그럴듯하지만, R1이 라우터인지 스위치인지, area 0인지 area 1인지, 우리 회사의 OSPF process ID가 1인지 100인지 모델은 모른다. 네트워크 운영의 답은 늘 "우리 환경에서는"이라는 단서가 붙는다.

## 해법: 컨텍스트 주입(context injection)

co-pilot은 모델을 바꾸는 게 아니다. **prompt 앞에 우리 환경 정보를 붙이는 것**이다. 책 Chapter 8은 컨텍스트를 5단계로 점진적으로 쌓는다.

| 단계 | 무엇을 알려주나 | 왜 필요한가 |
|---|---|---|
| device | 모델/위치/지원 프로토콜 | 라우터/스위치 분기 |
| topology | 어떤 인터페이스가 어디에 연결됐는가 | "R1 Gi0/1은 R2와 연결" 같은 사실 답 |
| impact | 이 장비를 건드리면 누가 영향을 받는가 | 변경 위험도 추정 |
| template | 회사 표준 설정 스니펫 | 사내 컨벤션을 따른 답 |
| example | 카테고리별 모범 답안 | troubleshooting/explanation 톤 학습 |

Recipe 8.2가 device + network context + example까지, Recipe 8.3이 거기에 topology + template + impact까지 더하는 흐름이다.

## Recipe 8.1은 왜 모델을 비교하는가

같은 질문을 모델 여러 개에 돌려서 채점한다. 책의 메시지는 "비싼 모델이 항상 정답이 아니다"이다. 2026년 시점에는 nano급도 컨텍스트만 잘 주면 충분히 답한다. 모델보다 컨텍스트의 품질이 답을 만든다는 점을 직접 확인하라는 것이다.

## 비교 대상 모델은 cheap/mid 3개를 기본값으로 두었다

Recipe 8.1 은 **여러 모델 비교**가 핵심이라 모델 1개로는 의미가 없다. 책은 gpt-3.5-turbo / gpt-4o-mini / gpt-4o 를 비교 모델로 썼지만, 2026년 시점의 가격대에 맞춰 다음 3개를 기본값으로 둔다.

- `gpt-4.1-nano` — 2026년 nano급 최저가 모델
- `gpt-4o-mini` — 책에도 등장하는 mid-tier
- `gpt-4.1-mini` — nano보다 성능 좋고 mid보다 저렴

세 모델 다 cheap/mid tier라 반복 실험해도 비용 부담이 적다. Recipe 8.2/8.3 의 대화형 co-pilot 은 별개의 `OPENAI_MODEL` (기본 `gpt-4.1-nano`) 을 쓴다.

다른 조합으로 비교하고 싶으면 환경변수로 한 줄만 바꾼다.

```bash
EVAL_MODELS=gpt-4.1-nano,gpt-4o uv run python src/recipe_8_1/run_all.py
```

## 정답은 없다, 맥락이 있을 뿐이다

여기서 다룬 컨텍스트 5단계는 책의 예시일 뿐이다. 회사마다 변경 관리 절차, 표준 ACL, 모니터링 임계값 같은 다른 컨텍스트가 있다. co-pilot의 본질은 "**무엇을 컨텍스트로 줄지 결정하는 것은 네트워크 엔지니어**"라는 점이다. LLM은 그 컨텍스트를 사람의 언어로 다시 빚어주는 도구다.

## 참고

- AI Networking Cookbook (Eric Chou, Packt 2026) — Chapter 8
- 원본 코드: <https://github.com/PacktPublishing/AI-Networking-Cookbook-First-Edition>n>
- OpenAI Chat Completions API
