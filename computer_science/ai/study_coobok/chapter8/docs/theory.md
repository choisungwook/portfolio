# Theory — 왜 LLM 위에 컨텍스트를 얹으면 co-pilot이 되는가

## 문제: raw LLM이 네트워크 엔지니어에게 모자란 점

ChatGPT에게 "Configure OSPF on R1"이라고 물으면 일반론적인 Cisco IOS 명령을 돌려준다. 답은 그럴듯하지만 틀린다. R1이 라우터인지 스위치인지, area 0인지 area 1인지, 우리 사이트의 OSPF process ID가 1인지 100인지 LLM은 모른다. 네트워크 운영의 정답은 항상 "우리 환경에서는"이라는 단서가 붙는다.

## 해법: 컨텍스트 주입(context injection)

co-pilot은 모델을 바꾸는 게 아니다. **모델에게 던지는 프롬프트 앞에 우리 환경 정보를 붙이는** 것이다. 이 책 챕터 8에서는 컨텍스트를 5단계로 쌓는다.

| 단계 | 무엇을 알려주나 | 효과 |
|---|---|---|
| device | 모델/위치/지원 프로토콜 | 라우터인지 스위치인지 분기 |
| topology | 어떤 인터페이스가 어디에 연결됐는지 | "R1 Gi0/1은 R2와 연결" 같은 사실 답변 |
| impact | 이 장비를 건드리면 누가 영향을 받는지 | 변경 작업의 위험도 추정 |
| template | 회사 표준 설정 스니펫 | LLM이 사내 컨벤션을 따르게 됨 |
| example | 카테고리별 모범 답안 | troubleshooting/explanation 톤 학습 |

## 모델 선택은 부차적이다 — 그래도 비교는 해야 한다

Recipe 8.1은 같은 질문을 여러 모델에 돌려 채점한다. 의도는 "비싼 모델이 항상 정답이 아니다"이다. 2026년 기준으로 nano급으로도 컨텍스트만 잘 주면 충분한 경우가 많다. 모델보다 컨텍스트의 품질이 답을 만든다는 것을 직접 확인하라는 것이 책의 메시지다.

## 그래서 우리 구현이 무엇을 보여주는가

`network_copilot/context.py`가 5단계 컨텍스트를 한 함수로 조립하는 핵심이다. CLI에서 같은 질문을 컨텍스트 없이(다른 ChatGPT 창)와 있이 던져 비교하면, "정답은 모델이 아니라 컨텍스트가 만든다"가 손에 잡힌다.

## 정답은 없다, 맥락이 있을 뿐이다

여기 컨텍스트 5단계는 책의 예시다. 회사마다 운영 정책, 변경 관리 절차, 표준 ACL 같은 다른 컨텍스트가 있다. co-pilot의 본질은 "**무엇을 컨텍스트로 줄지 결정하는 것은 네트워크 엔지니어**"라는 점이다. LLM은 그 컨텍스트를 사람의 언어로 다시 빚어주는 도구일 뿐이다.

## 참고자료

- AI Networking Cookbook (Eric Chou, Packt 2026) — Chapter 8
- 원본 코드: [`AI-Networking-Cookbook-First-Edition/ch08`](https://github.com/PacktPublishing/AI-Networking-Cookbook-First-Edition)
- OpenAI Chat Completions API
