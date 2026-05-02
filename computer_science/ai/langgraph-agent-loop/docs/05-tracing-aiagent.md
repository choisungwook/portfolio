# 트레이싱: agent를 디버깅하는 법

목표는 **에이전트와 agent loop이 어떻게 동작하는지 눈으로 보고, 어느 축(모델 / 도구 / 에이전트 코드)에서 망했는지 추적**하는 것이다. 세 단계로 올라간다.

## Level 1 — 콘솔 trace (`src/tracing.py`)

`ex02`, `ex04`의 main 함수는 다음 순서로 트레이싱을 출력한다.

1. `print_graph(graph)` — 그래프 구조를 mermaid로 출력 (에이전트가 어떻게 생겼는지 먼저 본다)
2. `print_turn_header(question)` — 턴 시작과 사용자 질문
3. step마다 `print_turn(step, payload, accumulated=final_state)` — 그 step에서 추가된 메시지를 색깔 패널로 출력
4. `print_turn_footer(final_state)` — 턴 종료 요약 (총 inference 횟수, 누적 메시지 수, 종료 이유)

### 색깔 = 메시지 타입 = agent loop 안의 역할

| 색 | 메시지 타입 | 라벨 | agent loop 안에서의 역할 |
|---|---|---|---|
| 흰색 | HumanMessage | (USER) | 사용자 입력. prompt의 시작 |
| 청록 | AIMessage with tool_calls | LOOP CONTINUE | 모델의 inference 결과 — "이 도구 호출해줘" 요청. 에이전트가 도구를 실행하고 다시 inference 호출 |
| 노랑 | ToolMessage | TOOL RESULT | 에이전트가 도구를 실제로 실행해서 받은 결과. prompt에 누적되어 다음 inference 입력이 됨 (= Codex 글의 `function_call_output`) |
| 초록 | AIMessage 최종 (tool_calls 없음) | TURN END | 사용자에게 줄 답 = assistant message. 에이전트가 이걸 보고 loop을 종료 |

### 패널 제목에서 보이는 것

각 패널 제목에 다음 메타 정보가 같이 출력된다.

- `step=N` — 그래프 노드 실행 횟수
- `node=call_model` 또는 `node=tools` — 어느 노드가 메시지를 추가했는지
- `accumulated_messages=N` — 그 시점까지 state에 누적된 messages 총 개수 (Codex 글의 ever-growing prompt를 숫자로 본다)

### 턴 종료 요약 (print_turn_footer)

`turn summary` 패널에 다음이 나온다.

- 누적 메시지 수와 타입별 분포 (Human / AI(tool_calls) / Tool / AI(final))
- loop iteration 수 (= LLM inference 호출 횟수)
- 종료 이유 ("마지막 AIMessage의 tool_calls가 비어있음 → assistant message로 턴 종료")

이 요약이 **"agent loop이 실제로 몇 번 돌았고 왜 종료됐는가"의 답**이다.

### 무엇을 어떻게 검증하나

| 확인 사항 | 어디를 보나 |
|---|---|
| 에이전트가 도구를 부르긴 했는가 | 청록 패널이 한 개 이상 있는가 |
| 도구가 성공했는가 | 노랑 패널의 내용이 `ERROR:`로 시작 안 하는가 |
| 모델이 도구 결과를 prompt에 받아 다시 inference 했는가 | 노랑 패널 다음에 청록 또는 초록 패널이 따라 나오는가 |
| assistant message가 나왔는가 (= 턴 종료) | 마지막에 초록 패널이 있고, footer에 "tool_calls가 비어있음" 종료 이유가 찍혔는가 |
| loop이 몇 번 돌았는가 | footer의 `loop iteration` 수치 |
| ever-growing prompt가 실제로 자랐는가 | 각 패널 제목의 `accumulated_messages` 숫자가 step 진행과 함께 증가하는가 |
| agent loop이 종료 조건 없이 무한 반복하는가 | step 번호가 비정상적으로 큼 + 같은 도구를 반복 호출 |

### 이상한 시퀀스 예시 → 의심 축

- **청록 없이 초록 곧장**: 모델이 도구를 안 부름. 도구가 필요한 질문이라면 → **모델 축** (system prompt / 도구 description / 모델 자체)
- **노랑이 `ERROR:`로 시작**: 도구 실행 실패 → **도구 축** (도구 코드 / 환경)
- **청록 → 노랑 → 청록 → 노랑 → ... 끝없이 반복**: → **에이전트 코드 축** (`should_continue`)이거나, 모델이 도구 결과를 잘못 해석해 같은 도구를 무한 호출 (→ 모델 축)
- **초록 패널이 안 나오고 갑자기 끝**: 그래프 종료 조건은 정확히 "tool_calls 없는 AIMessage". 이게 안 보이면 stream을 잘못 소비하고 있거나 에러로 중단된 것

## Level 2 — LangSmith (강력 추천, 무료)

LangSmith는 LangChain 팀이 만든 트레이싱 SaaS다. **환경변수 2개만 설정하면 코드 변경 없이 자동 트레이싱**된다.

### 가입 절차 (2026년 4월 기준)

1. <https://smith.langchain.com> 접속
2. "Sign up" → 이메일 또는 Google 계정
3. 로그인 후 좌측 하단 Settings → "API Keys" → "Create API Key" → key 복사 (한 번만 표시되므로 즉시 저장)
4. 무료 Developer 티어: **월 5,000 traces 무료, 신용카드 등록 불필요** (학습용으로 충분)

### `.env`에 추가

```
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=langgraph-handson
```

**코드 변경 없음**. langgraph가 환경변수를 자동 감지해서 모든 LLM 호출과 노드 실행을 LangSmith로 보낸다.

### 확인 방법

1. `uv run python -m src.ex02_weather_agent` 실행
2. <https://smith.langchain.com> → 좌측 Projects → `langgraph-handson` 클릭
3. 방금 실행한 trace 클릭 → tree view에서 각 노드 / 도구 호출 / LLM 호출의 입출력, 토큰, 지연시간 확인

`[스크린샷: trace tree view]` (학습자가 직접 채우기)

### LangSmith UI를 디버깅 멘탈 모델과 매핑

- **모델 축** → LLM 호출 노드를 클릭 → input messages (system + history)와 output (content + tool_calls) 확인. 모델이 무엇을 보고 무엇을 답했는지가 한눈에 보인다.
- **도구 축** → tool 호출 노드를 클릭 → input args와 output 확인. 도구에 들어간 인자와 나온 결과가 그대로 보인다.
- **에이전트 코드 축 (무한 루프 등)** → trace tree의 깊이 / 반복 패턴이 그대로 보인다 (같은 도구 호출이 N번 반복).

콘솔 trace는 디버깅의 1차 스캐너, LangSmith는 정밀 분석 장비다. 둘 다 쓴다.

### 콘솔에는 안 보이고 LangSmith에서만 보이는 것

`ex04`의 `SystemMessage`처럼 `call_model` 노드 안에서만 prepend되고 state(`messages`)에는 안 들어가는 메시지는 콘솔 trace에 안 보인다. 하지만 **LangSmith의 LLM 호출 input**에서는 그대로 보인다 — Responses API에 보낸 prompt 전체가 캡처되기 때문이다. 시스템 프롬프트가 어떻게 쓰이는지 확인하려면 LangSmith를 봐야 한다.

## Level 3 — Langfuse (오픈소스 대안, 선택)

LangSmith가 부담스럽거나 self-host 하고 싶을 때.

- MIT 라이센스, Docker Compose로 self-host 가능
- Langfuse Cloud Free: 월 50K observations 무료
- 통합: `langfuse` 패키지 설치 → `LangfuseCallbackHandler`를 graph 호출 시 callbacks로 전달
- 학습 단계에서는 LangSmith를 추천한다. 회사에서 self-host 필요할 때 다시 검토.

## 디버깅 워크플로 (이 문서의 결론)

```
문제 발생
  ↓
1. 콘솔 trace로 색깔 시퀀스 확인 (청록 → 노랑 → 청록 → ... 순서가 자연스러운가?)
  ↓
2. 시퀀스가 이상하면 LangSmith에서 해당 trace 열기
  ↓
3. 어느 축인지 분리:
   - LLM 노드 input/output → reasoning 축
   - tool 노드 input/output → tool 축
  ↓
4. 축에 맞게 수정:
   - reasoning → 프롬프트 / 도구 description / 모델 변경
   - tool → 도구 코드 / 환경 수정
```

두 축을 섞지 않는 게 핵심이다. "도구를 안 부른다"가 보이는데 도구 코드를 들여다보는 건 시간 낭비다 — 모델 입력을 봐야 한다. 반대도 마찬가지다.

## 참고자료

- LangSmith 가입: <https://smith.langchain.com>
- LangSmith 공식 문서: <https://docs.smith.langchain.com>
- Langfuse: <https://langfuse.com>
- LangGraph 트레이싱 가이드: <https://langchain-ai.github.io/langgraph/how-tos/run-id-langsmith/>
