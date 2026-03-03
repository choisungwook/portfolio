# Level 1: AI Agent 기본 루프 직접 구현

OpenAI SDK의 function calling으로 agent의 핵심 동작 원리를 직접 구현합니다.

## 핵심 개념

AI Agent는 세 단계를 반복하는 루프입니다.

```
User 질문 → LLM 판단 → Tool 실행 → LLM 판단 → 최종 응답
```

LLM이 "어떤 tool을 호출할지" 스스로 결정하는 것이 핵심입니다.

## 실행 방법

```bash
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

## 실행 결과 예시

```
[User] 서울 날씨 어때?
[Agent] LLM에 요청 중...
[Agent] tool 호출 1개 감지
  -> get_weather({'city': 'Seoul'})
  <- {"city": "Seoul", "temperature": 3, "condition": "cloudy"}
[Agent] LLM에 요청 중...

[Agent Response]
서울 날씨는 현재 흐리고, 기온은 3도입니다.
```

## 코드 구조

| 파일 | 설명 |
|------|------|
| `main.py` | agent 루프, tool 정의, tool 실행 로직 |
| `requirements.txt` | 의존성 |
