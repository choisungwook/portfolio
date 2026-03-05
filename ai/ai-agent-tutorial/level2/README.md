# Level 2: LangGraph로 에이전트 구현하기

## 요약

- LangGraph 프레임워크를 사용하여 **그래프 기반 AI 에이전트**를 구현합니다
- Level 1에서 직접 작성했던 에이전트 루프를 LangGraph가 대신 처리합니다
- 도구를 3개로 늘려서 에이전트가 여러 도구를 조합하는 모습을 확인합니다

## 목차

- [왜 LangGraph를 사용할까?](#왜-langgraph를-사용할까)
- [동작 원리](#동작-원리)
- [코드 구조](#코드-구조)
- [실행 방법](#실행-방법)
- [실행 결과 예시](#실행-결과-예시)
- [핵심 코드 설명](#핵심-코드-설명)
- [Level 1과 비교](#level-1과-비교)
- [참고자료](#참고자료)

## 왜 LangGraph를 사용할까?

Level 1에서 while 루프로 에이전트를 구현했습니다. 간단한 경우에는 잘 동작하지만, 에이전트가 복잡해지면 직접 관리하기 어렵습니다.

LangGraph는 에이전트의 흐름을 **그래프(Graph)** 로 표현합니다. 노드(node)는 작업 단위이고, 엣지(edge)는 작업 간의 흐름입니다.

**LangGraph가 해결하는 문제:**

- 에이전트 루프 관리 (도구 호출 → 결과 전달 반복)
- 상태(state) 관리 (메시지 히스토리 자동 관리)
- 조건부 분기 (도구 호출 여부에 따른 다음 동작 결정)

## 동작 원리

LangGraph는 에이전트를 그래프로 표현합니다.

```
START → agent 노드 → 도구 호출 있으면 → tools 노드 → agent 노드 (반복)
                   → 도구 호출 없으면 → END
```

Level 1의 while 루프와 동작은 같지만, 그래프로 구조화하면 복잡한 에이전트를 만들 때 흐름을 명확하게 관리할 수 있습니다.

## 코드 구조

```
level2/
├── README.md
├── requirements.txt    # langgraph, langchain-openai
└── main.py             # LangGraph 에이전트 구현
```

도구 3개를 사용합니다.

| 도구 | 설명 |
|------|------|
| `calculator` | 수학 계산 |
| `get_current_time` | 현재 시간 조회 |
| `search_knowledge` | 내부 지식베이스 검색 |

## 실행 방법

```bash
cd level2
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

## 실행 결과 예시

```
사용자: kubernetes가 뭔지 알려주고, 현재 시간도 알려줘
--------------------------------------------------
  [도구 호출] search_knowledge({"query": "kubernetes"})
  [도구 결과] Kubernetes는 컨테이너 오케스트레이션 플랫폼입니다...
  [도구 호출] get_current_time({})
  [도구 결과] 2025-01-15 14:30:00
에이전트: Kubernetes는 컨테이너 오케스트레이션 플랫폼으로, Pod, Service, Deployment 등의
리소스를 관리합니다. 현재 시간은 2025년 1월 15일 오후 2시 30분입니다.
```

에이전트가 한 번의 질문에 **도구 2개를 동시에 호출**하는 것을 확인할 수 있습니다.

## 핵심 코드 설명

### 도구 정의

LangGraph에서는 `@tool` 데코레이터로 도구를 정의합니다. Level 1에서 JSON Schema로 직접 작성했던 것을 데코레이터가 대신 처리합니다.

```python
@tool
def calculator(expression: str) -> str:
    """간단한 수학 계산을 수행합니다. expression: 계산할 수식 (예: '2 + 3 * 4')"""
    result = safe_eval(expression)
    return str(result)
```

### 그래프 구성

```python
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", ToolNode(tools_list))

graph.add_edge(START, "agent")
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")

app = graph.compile()
```

`add_conditional_edges`가 Level 1의 `if not message.tool_calls` 분기를 대신합니다. 도구 호출이 있으면 `tools` 노드로, 없으면 `END`로 이동합니다.

### 상태 관리

```python
class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
```

`add_messages`는 메시지 리스트를 자동으로 관리합니다. Level 1에서 `messages.append()`를 직접 호출했던 것을 LangGraph가 처리합니다.

## Level 1과 비교

| 항목 | Level 1 | Level 2 |
|------|---------|---------|
| 에이전트 루프 | while 루프 직접 구현 | 그래프 구조로 자동 관리 |
| 도구 정의 | JSON Schema 직접 작성 | `@tool` 데코레이터 |
| 상태 관리 | `messages.append()` 직접 호출 | `AgentState`로 자동 관리 |
| 조건부 분기 | `if not message.tool_calls` | `add_conditional_edges` |
| 코드 양 | 적음 | 비슷하지만 구조적 |
| 확장성 | 복잡해지면 관리 어려움 | 노드/엣지 추가로 확장 용이 |

**Level 1은 원리를 이해하기 좋고, Level 2는 실제 프로젝트에서 사용하기 좋습니다.**

## 참고자료

- https://langchain-ai.github.io/langgraph/
- https://langchain-ai.github.io/langgraph/tutorials/introduction/
- https://python.langchain.com/docs/concepts/tools/
