# Level 2: Multi-Agent Handoff (OpenAI Agents SDK)

OpenAI Agents SDK로 여러 agent가 협업하는 multi-agent 시스템을 구현합니다.

## 핵심 개념

Multi-Agent의 핵심은 **handoff(위임)** 입니다.

```
User 질문 → Triage Agent 판단 → 전문 Agent에 위임 → Tool 실행 → 응답
```

Triage Agent가 "어떤 전문 agent에게 넘길지" 판단합니다.

## Agent 구성

| Agent | 역할 | 사용 Tool |
|-------|------|-----------|
| Triage Agent | 사용자 요청을 분류하고 적절한 agent에 위임 | handoff만 사용 |
| Weather Agent | 날씨 정보 조회 | `get_weather` |
| Restaurant Agent | 맛집 검색 및 예약 | `search_restaurant`, `book_restaurant` |

## 실행 방법

```bash
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python main.py
```

## 실행 결과 예시

```
[User] 도쿄에서 일식 맛집 추천해줘
[Final Agent] Restaurant Agent
[Response]
도쿄 일식 맛집을 추천드립니다!
1. Tsukiji Sushi (평점 4.8)
2. Ramen Ichiran (평점 4.6)
```

## 코드 구조

| 파일 | 설명 |
|------|------|
| `main.py` | agent 정의, tool 정의, handoff 설정, 실행 로직 |
| `requirements.txt` | 의존성 |
