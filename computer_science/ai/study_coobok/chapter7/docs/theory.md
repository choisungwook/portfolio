# 왜 Streamlit을 프로덕션에 안 쓰고 FastAPI로 옮겼나

## 책의 의도

책 챕터 7은 챕터 6에서 만든 Streamlit 기반 Network AI Assistant를 **프로덕션에 가까운 backend 구조**로 옮긴다. 책은 main_v1 → main_v4 한 파일씩 진화시키며 이 변화를 보여준다.

여기서 "프로덕션"은 내 노트북에서 데모로 돌리는 게 아니라, 돈을 받고 사용자에게 서비스하는 상황이다.

## Streamlit이 프로덕션에 안 맞는 이유

1. **전체 스크립트 재실행 구조** — Streamlit은 사용자가 버튼을 누르거나 입력값을 바꾸면 스크립트를 다시 실행한다. 작은 데모에는 편하지만 LLM 호출, DB 저장, 외부 API 호출이 섞이면 "내가 원하지 않은 코드가 다시 실행되는 상황"이 생긴다.
2. **긴 작업을 다루는 방식** — 임베딩 생성, LLM 추론, 로그 저장은 짧으면 몇 초, 길면 몇십 초 이상 걸린다. ASGI(Asynchronous Server Gateway Interface) 기반의 FastAPI가 이런 작업을 다루기 더 적합하다.
3. **API 생성** — Streamlit은 API를 만드는 기능을 제공하지 않는다. FastAPI는 처음부터 HTTP API를 만들기 위한 프레임워크다.
4. **운영 구조로 확장** — 프로덕션은 인증, rate limit, timeout, retry, logging, tracing, autoscaling이 따라온다. Streamlit은 빠르게 기능을 보여주는 게 목적이라 운영 기능이 없다. 오토스케일링 환경에서 비즈니스 로직이 잘 동작한다는 검증 자료도 찾기 어려웠다.

## 왜 FastAPI인가

FastAPI는 파이썬으로 API와 HTML을 모두 만들 수 있지만, AI 프로덕션에서 가장 큰 장점은 **이벤트 루프 기반 비동기**다.

API가 실행하는 로직에 임베딩이나 추론이 끼면 latency가 몇 초~몇십 초로 늘어난다. 비동기를 지원하지 않으면 다른 요청이 block되어 대기해야 한다.

다른 파이썬 웹 프레임워크인 Django는 비동기를 부분 지원한다. 또한 인터페이스가 ASGI가 아니어서 튜닝이 필요하다.

비동기 외에도 FastAPI는 Pydantic을 적극 사용해서 데이터 관리가 쉽고, FastAPI CLI, swagger 자동 생성, 검색 자료가 많은 장점이 있다.

## 정답은 없다, 맥락이 있을 뿐이다

이 챕터는 "Streamlit이 나쁘다"가 아니라 "프로덕션이라는 맥락에서는 FastAPI가 더 맞는다"는 이야기다. 사내 데모, PoC, 데이터 사이언티스트의 모델 검증용 UI라면 Streamlit이 더 빠른 선택이다.
