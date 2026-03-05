# AI Agent 핸즈온 튜토리얼

## 요약

- AI agent는 **LLM이 스스로 판단하여 도구(tool)를 호출하고, 결과를 보고 다음 행동을 결정하는 구조**입니다
- level1에서 OpenAI API로 에이전트 루프를 직접 구현하고, level2에서 LangGraph 프레임워크를 사용합니다
- 두 레벨을 비교하면 에이전트의 동작 원리와 프레임워크가 해주는 역할을 이해할 수 있습니다

## 목차

- [AI Agent란?](#ai-agent란)
- [디렉터리 구조](#디렉터리-구조)
- [사전 준비](#사전-준비)
- [Level 1: 직접 구현하는 AI Agent](#level-1-직접-구현하는-ai-agent)
- [Level 2: LangGraph로 구현하는 AI Agent](#level-2-langgraph로-구현하는-ai-agent)
- [참고자료](#참고자료)

## AI Agent란?

AI Agent는 두 가지 단어를 합친 용어입니다. AI + Agent

1. AI: LLM(Large Language Model)과 같은 인공지능 모델
2. Agent: 자율적으로 판단하고 행동하는 주체

정리하면, **AI Agent는 LLM이 자율적으로 판단하여 행동하는 시스템**입니다.

### 그런데, 일반적인 LLM 챗봇과 뭐가 다를까?

일반 챗봇은 질문을 받으면 텍스트만 응답합니다. 반면 에이전트는 도구(tool)를 호출할 수 있습니다.

예를 들어, "지금 몇 시야?"라고 물으면 일반 챗봇은 "저는 현재 시간을 알 수 없습니다"라고 답합니다. 하지만 에이전트는 시간 조회 도구를 호출해서 실제 시간을 알려줍니다.

### 에이전트의 핵심 동작 루프

**에이전트의 핵심은 "생각 → 행동 → 관찰" 루프**입니다.

```
사용자 질문 → LLM 판단 → 도구 호출 → 결과 관찰 → LLM 판단 → 최종 응답
```

이 루프를 ReAct(Reasoning + Acting) 패턴이라고 부릅니다.

## 디렉터리 구조

```
ai-agent-tutorial/
├── README.md
├── level1/          # OpenAI API로 에이전트 루프 직접 구현
│   ├── README.md
│   ├── requirements.txt
│   └── main.py
└── level2/          # LangGraph 프레임워크 사용
    ├── README.md
    ├── requirements.txt
    └── main.py
```

## 사전 준비

OpenAI API 키가 필요합니다.

```bash
export OPENAI_API_KEY="your-api-key"
```

## Level 1: 직접 구현하는 AI Agent

OpenAI의 function calling API를 사용하여 에이전트 루프를 직접 구현합니다. 프레임워크 없이 동작 원리를 이해하는 것이 목표입니다.

자세한 설명은 [level1/README.md](./level1/README.md)를 참고하세요.

## Level 2: LangGraph로 구현하는 AI Agent

LangGraph 프레임워크를 사용하여 그래프 기반 에이전트를 구현합니다. 프레임워크가 에이전트 루프를 어떻게 추상화하는지 이해하는 것이 목표입니다.

자세한 설명은 [level2/README.md](./level2/README.md)를 참고하세요.

## 참고자료

- https://platform.openai.com/docs/guides/function-calling
- https://langchain-ai.github.io/langgraph/
- https://www.promptingguide.ai/techniques/react
