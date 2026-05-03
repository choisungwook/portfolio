# Streamlit + OpenAI — Network Engineer AI Assistant

이 디렉터리는 *AI Networking Cookbook* 1판 챕터 7 코드를 2026년 5월 기준으로 코드를 리팩토링 했다.

- AI 모델은 `gpt-4.1-nano`로 변경

## 예제 의도

| 버전 | 본질 (이 단계가 답하려는 질문) |
|---|---|
| v1 | "OpenAI에 한 번 묻고 한 번 답을 받는다는 것이 무엇인가?" |
| v2 | "system prompt를 바꾸면 같은 질문에도 답이 달라지는가?" |
| v3 | "프로세스가 죽어도 대화가 남으려면 무엇이 필요한가?" |
| v4 | "직전 대화를 모델이 기억하려면 어떻게 해야 하는가?" |

## 핸즈온

- [docs/02-handson.md](./docs/02-handson.md) — v1부터 v4까지 손으로 따라 해보는 흐름

## 더 읽기

- [docs/03-streamlit-basics.md](./docs/03-streamlit-basics.md) — Streamlit이 어떻게 동작하는가 + 단점

## 참고자료

- 원본 코드: <https://github.com/PacktPublishing/AI-Networking-Cookbook-First-Edition/tree/main/ch07>
- Streamlit 공식: <https://docs.streamlit.io/>
- OpenAI Python SDK: <https://github.com/openai/openai-python>
- gpt-4.1-nano 모델: <https://platform.openai.com/docs/models/gpt-4.1-nano>
