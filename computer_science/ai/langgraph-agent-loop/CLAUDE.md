# CLAUDE.md — LangGraph Agent Loop 입문 튜토리얼

이 코드베이스에서 일할 때 알아야 할 것을 정리한다. 무엇을 어떻게 하라는 step-by-step 지시는 아니다. 무엇이 이 프로젝트인지, 무엇이 핵심인지, 무엇은 의도적으로 빼는지를 설명한다.

## 이 프로젝트가 무엇인가

**AI 모델, AI 에이전트, agent loop — 세 단어의 차이를 입문자가 코드로 손에 익히게 하는 튜토리얼**이다. 모든 결정은 이 한 문장으로 환원된다.

OpenAI Codex agent loop 글이 묘사한 production agent의 구조를 langgraph로 작게 재현하면서, 학습자가 "AI 모델 호출 한 번"과 "에이전트가 돌리는 agent loop"의 구조적 차이를 두 도메인에서 반복 관찰한다. 도메인 차이(날씨 / k8s)는 부차적이고, 같은 비교가 도메인과 무관함을 손으로 느끼는 것이 목적이다.

## 학습자가 가져가야 할 세 단어

| 단어 | 무엇인가 |
|---|---|
| **AI 모델** | 입력 토큰 → 출력 토큰을 만드는 한 번의 inference. stateless. |
| **AI 에이전트(harness)** | 모델을 감싸서 prompt 조립 / inference 호출 / 도구 실제 실행 / 결과 누적 / 종료 판단을 orchestrate하는 외부 코드. 우리가 langgraph로 만든다. |
| **Agent loop** | 에이전트가 한 턴을 돌릴 때 따르는 실행 패턴. inference ↔ 도구 실행이 번갈아 일어나며 prompt가 누적된다. |

이 셋이 분리되어 머릿속에 박히는 것이 이 프로젝트의 유일한 성공 지표다. 학습자가 글을 다 읽고도 "에이전트 = 도구 쓰는 모델", "에이전트 = agent loop" 같은 단축어로 잡고 있다면 프로젝트는 실패한 것이다.

## 산출물의 모양 (개략)

- `docs/` — 이론(세 단어 분리), 용어 사전, 두 핸즈온, 트레이싱
- `src/` — 도메인마다 "AI 모델 호출 한 번" 한 짝 + "에이전트가 agent loop을 돌리는 것" 한 짝
- `manifests/` — 두 번째 핸즈온용 일부러 망가진 Pod
- 학습자 동선: README → docs/01 → 02 → 03 → 04 → 05
- 빌드/실행: Python 3.12, uv, kind, kubectl

세부 파일명·구조는 디렉터리 자체를 본다. 여기 박지 않는다 — 그래야 코드와 문서가 어긋날 때 어느 한쪽이 거짓말한다.

## 코드의 가치관

- **가독성이 추상화보다 우선**한다. 학습용이라 의미 없는 helper / 너무 영리한 패턴은 본질을 가린다.
- **단순한 loop 한 개를 명확히 보여주는 것**이 기능 풍부함보다 우선한다.
- **두 핸즈온은 같은 그래프 패턴을 재사용**한다. "도메인이 달라도 구조가 같다"가 학습 포인트라서.
- 변수명은 풀어쓰기 (`llm`, `tools`, `messages`).
- 의미 없는 주석 금지. 한 파일이 의도 없이 100줄을 넘으면 분리 검토.

## 좋은 문서는 어떤 모양인가

- **docs/01은 세 단어 분리에서 시작한다.** 효과(effect, "도구가 있어야 답할 수 있다")로 시작하지 않고 본질(essence, "에이전트는 모델을 감싸는 외부 코드")로 시작한다.
- **핸즈온 docs는 코드 구조 차이를 본질로 다룬다.** 답변 차이는 효과로만 언급한다.
- **각 문서 말미에 참고자료 섹션**을 둬서 학습자가 확장할 진입점을 준다.
- **언어는 한국어**, 인용/외래어는 영문 그대로.

## 좋은 trace는 어떤 모양인가

trace의 목표는 **"에이전트와 agent loop이 어떻게 동작하는지 눈으로 보고, 어디가 망했는지 추적"**하는 것이다.

- 그래프 구조를 먼저 보여주고
- 메시지 타입을 색깔로 구분해 agent loop의 각 step에서 무슨 일이 일어났는지 시각화하고
- 턴 종료 시 loop iteration 횟수 / 누적 메시지 수 / 종료 이유를 요약한다 (= ever-growing prompt를 숫자로)
- 콘솔 trace는 1차 스캐너, LangSmith는 정밀 분석 장비. 둘 다 쓴다.

assistant message가 trace에 명시적으로 보여야 한다. "loop이 왜 끝났는가"가 trace에서 즉시 답해져야 디버깅 멘탈 모델이 작동한다.

## 디버깅의 멘탈 모델

에이전트가 잘못 동작할 때 **세 축**으로 분리해 본다. 섞으면 디버깅이 안 된다.

| 축 | 어디가 망했나 | 어디를 고치나 |
|---|---|---|
| 모델 | inference 자체가 부적절한 출력을 냄 | system prompt / 도구 description / 모델 |
| 도구 | 모델 출력은 옳은데 도구 실행이 실패 | 도구 코드 / 환경 |
| 에이전트 코드 (loop) | 종료 조건·분기 로직이 잘못됨 | 그래프 코드 자체 |

## 의도적으로 빼는 것 (학습자 혼란 방지)

- `create_react_agent` (deprecated, 추상화가 본질을 숨김)
- 비동기 코드
- 멀티 에이전트 / supervisor 패턴
- 체크포인트 / human-in-the-loop / persistence
- 자체 LangSmith 대시보드 코드 (공식 SaaS UI 사용 가이드만)
- prompt caching / compaction 같은 production 최적화 (Codex 글에는 있지만, 학습용에서는 *누적 자체*만 보여주고 최적화는 다루지 않음)

핵심은 **단순한 loop 한 개를 명확히 보여주는 것**이다. 이 원칙이 의심스러울 때마다 의심하는 쪽을 빼는 게 옳다.

## 이 프로젝트가 기대는 외부 자료

- OpenAI - Unrolling the Codex agent loop (이론의 베이스)
- LangGraph 공식 문서 (StateGraph / ToolNode / add_messages reducer)
- LangChain Agents 가이드
- Open-Meteo (no-key 날씨 API, 핸즈온 1)
- kind / kubernetes 1.35 (핸즈온 2)
- LangSmith / Langfuse (트레이싱)
