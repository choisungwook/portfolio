# Level 1: OpenAI API로 에이전트 직접 구현하기

## 요약

- OpenAI의 function calling API를 사용하여 **에이전트 루프를 직접 구현**합니다
- LLM이 도구 호출 여부를 판단하고, 호출 결과를 다시 LLM에 전달하는 루프가 핵심입니다
- 계산기와 시간 조회 도구 2개를 사용하는 간단한 에이전트를 만듭니다

## 목차

- [동작 원리](#동작-원리)
- [코드 구조](#코드-구조)
- [실행 방법](#실행-방법)
- [실행 결과 예시](#실행-결과-예시)
- [핵심 코드 설명](#핵심-코드-설명)
- [참고자료](#참고자료)

## 동작 원리

에이전트의 동작은 while 루프로 구현됩니다.

```
1. 사용자 메시지를 LLM에 전달
2. LLM 응답 확인
   - 도구 호출이 있으면 → 도구 실행 → 결과를 메시지에 추가 → 2번으로 돌아감
   - 도구 호출이 없으면 → 최종 응답 반환
```

**핵심은 LLM이 도구를 호출할지 말지를 스스로 판단한다는 점**입니다. 개발자는 어떤 도구가 있는지만 알려주면 됩니다.

## 코드 구조

```
level1/
├── README.md
├── requirements.txt    # openai 패키지
└── main.py             # 에이전트 구현 전체 코드
```

`main.py` 하나에 모든 코드가 있습니다. 크게 3가지 부분으로 나뉩니다.

1. **도구 정의**: LLM에게 알려줄 도구 스펙(JSON Schema)과 실제 도구 함수
2. **에이전트 루프**: LLM 호출 → 도구 실행 → 결과 전달 반복
3. **실행**: 다양한 질문으로 에이전트 테스트

## 실행 방법

```bash
cd level1
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

## 실행 결과 예시

```
사용자: 지금 몇 시야?
--------------------------------------------------
  [도구 호출] get_current_time({})
  [도구 결과] 2025-01-15 14:30:00
에이전트: 현재 시간은 2025년 1월 15일 오후 2시 30분입니다.

사용자: 123 * 456 + 789는 뭐야?
--------------------------------------------------
  [도구 호출] calculator({"expression": "123 * 456 + 789"})
  [도구 결과] 56877
에이전트: 123 * 456 + 789의 결과는 56,877입니다.
```

## 핵심 코드 설명

### 도구 정의

LLM에게 도구를 알려주려면 JSON Schema 형식으로 정의해야 합니다.

```python
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "간단한 수학 계산을 수행합니다",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "계산할 수식 (예: '2 + 3 * 4')",
                    }
                },
                "required": ["expression"],
            },
        },
    },
]
```

**LLM은 description을 읽고 어떤 도구를 호출할지 판단**합니다. 따라서 description을 명확하게 작성하는 것이 중요합니다.

### 에이전트 루프

```python
while True:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        tools=TOOLS,
    )

    message = response.choices[0].message
    messages.append(message)

    if not message.tool_calls:
        return message.content

    for tool_call in message.tool_calls:
        result = TOOL_FUNCTIONS[tool_call.function.name](**args)
        messages.append({"role": "tool", "content": result})
```

`tool_calls`가 없을 때까지 반복합니다. LLM이 도구를 호출하면 실행 결과를 `tool` 역할로 메시지에 추가하고, 다시 LLM을 호출합니다.

## 참고자료

- https://platform.openai.com/docs/guides/function-calling
- https://cookbook.openai.com/examples/how_to_call_functions_with_chat_models
