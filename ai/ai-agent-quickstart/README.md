# AI Agent Quickstart

# 요약

- AI Agent는 **LLM이 tool을 스스로 선택하고 실행하는 루프**입니다
- Level 1에서 OpenAI SDK로 agent 루프를 직접 구현하고, Level 2에서 OpenAI Agents SDK로 multi-agent handoff를 구현합니다
- 프레임워크 없이 동작 원리를 먼저 이해한 후, 프레임워크가 어떤 부분을 자동화하는지 체감합니다

# 목차

- [AI Agent가 뭘까?](#ai-agent가-뭘까)
- [Agent의 핵심 루프](#agent의-핵심-루프)
- [Level 1: Agent 루프 직접 구현](#level-1-agent-루프-직접-구현)
- [Level 2: Multi-Agent Handoff](#level-2-multi-agent-handoff)
- [Level 1과 Level 2의 차이점](#level-1과-level-2의-차이점)
- [실습 환경](#실습-환경)
- [참고자료](#참고자료)

# AI Agent가 뭘까?

AI Agent는 두 가지 단어를 합친 용어입니다. AI + Agent

1. AI: 여기서는 LLM(Large Language Model)을 의미합니다
2. Agent: 스스로 판단하고 행동하는 주체

정리하면 **AI Agent는 LLM이 스스로 판단해서 tool을 호출하고, 그 결과를 바탕으로 다음 행동을 결정하는 시스템**입니다.

일반 챗봇과 다른 점은 뭘까요? 일반 챗봇은 질문을 받으면 바로 텍스트를 생성합니다. 반면 AI Agent는 질문을 받으면 "어떤 tool을 써야 하지?"를 먼저 판단합니다.

# Agent의 핵심 루프

Agent의 동작 원리는 아래 루프 하나로 요약됩니다.

```
┌─────────────────────────────────────────┐
│                                         │
│  User 질문                              │
│      ↓                                  │
│  LLM 판단: tool 호출이 필요한가?         │
│      ↓              ↓                   │
│   [Yes]           [No]                  │
│      ↓              ↓                   │
│  Tool 실행      최종 응답 반환           │
│      ↓                                  │
│  Tool 결과를 LLM에 전달                  │
│      ↓                                  │
│  다시 LLM 판단 (루프 반복)               │
│                                         │
└─────────────────────────────────────────┘
```

**LLM이 "tool 호출이 필요 없다"고 판단할 때까지 루프가 반복됩니다.** 이것이 agent의 전부입니다.

# Level 1: Agent 루프 직접 구현

프레임워크 없이 OpenAI SDK의 function calling만으로 agent 루프를 직접 구현합니다.

```
ai/ai-agent-quickstart/level1/
├── main.py              # agent 루프 전체 코드
└── requirements.txt
```

## 왜 프레임워크 없이 시작할까?

프레임워크가 뭘 해주는지 이해하려면, 프레임워크 없이 직접 만들어봐야 합니다. Level 1에서는 agent의 핵심 루프를 while문 하나로 구현합니다.

핵심 코드는 이렇습니다.

```python
while True:
  response = client.chat.completions.create(
    model=MODEL,
    messages=messages,
    tools=tools,
  )
  message = response.choices[0].message

  if message.tool_calls:
    for tool_call in message.tool_calls:
      result = execute_tool(tool_call.function.name, ...)
      messages.append({"role": "tool", "content": result, ...})
    continue

  return message.content
```

LLM 응답에 `tool_calls`가 있으면 tool을 실행하고 결과를 messages에 추가합니다. `tool_calls`가 없으면 최종 응답을 반환합니다.

```bash
cd level1
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

자세한 내용은 [level1/README.md](./level1/README.md)를 참고하세요.

# Level 2: Multi-Agent Handoff

OpenAI Agents SDK로 여러 agent가 협업하는 시스템을 구현합니다.

```
ai/ai-agent-quickstart/level2/
├── main.py              # multi-agent 전체 코드
└── requirements.txt
```

## Multi-Agent가 필요한 이유는?

Level 1처럼 하나의 agent에 모든 tool을 넣으면 어떤 문제가 생길까요?

1. tool이 많아지면 LLM이 올바른 tool을 선택하기 어려워집니다
2. system prompt가 길어지면 성능이 떨어집니다
3. 역할별로 다른 instructions이 필요합니다

Multi-Agent는 이 문제를 **전문 agent에게 위임(handoff)** 하는 방식으로 해결합니다.

```
User 질문
    ↓
Triage Agent (분류 담당)
    ↓                ↓
Weather Agent    Restaurant Agent
(날씨 전문)       (맛집 전문)
```

**Triage Agent가 사용자 요청을 분석하고, 적절한 전문 agent에게 넘깁니다.**

핵심 코드는 이렇습니다.

```python
weather_agent = Agent(
  name="Weather Agent",
  instructions="You are a weather specialist...",
  tools=[get_weather],
)

triage_agent = Agent(
  name="Triage Agent",
  instructions="Determine what the user needs and hand off...",
  handoffs=[weather_agent, restaurant_agent],
)

result = await Runner.run(triage_agent, query)
```

Level 1에서 직접 구현했던 while 루프, tool 실행, message 관리를 Agents SDK가 전부 처리합니다.

```bash
cd level2
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

자세한 내용은 [level2/README.md](./level2/README.md)를 참고하세요.

# Level 1과 Level 2의 차이점

| 항목 | Level 1 | Level 2 |
|------|---------|---------|
| 프레임워크 | 없음 (OpenAI SDK만) | OpenAI Agents SDK |
| Agent 수 | 1개 | 3개 (Triage + 전문 agent 2개) |
| 루프 관리 | 직접 while문 구현 | SDK가 자동 관리 |
| Tool 실행 | 직접 함수 매핑 | `@function_tool` 데코레이터 |
| 핵심 학습 | agent 동작 원리 이해 | multi-agent 협업 패턴 이해 |

# 실습 환경

- Python 3.10+
- OpenAI API Key 필요

```bash
export OPENAI_API_KEY="your-api-key"
```

# 참고자료

- https://platform.openai.com/docs/guides/function-calling
- https://github.com/openai/openai-agents-python
- https://openai.github.io/openai-agents-python/
