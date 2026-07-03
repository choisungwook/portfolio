# FastAPI SSE 핸즈온

HTTP 요청 하나를 오래 열어 두고 서버가 이벤트를 계속 보내면 어떤 흐름이 만들어질까요? 이 핸즈온은 FastAPI로 SSE(Server-Sent Events) 서버를 만들고, Docker Compose로 브라우저와 `curl`에서 이벤트 스트림을 확인하는 목적입니다.

## 문서

| 문서 | 내용 |
|---|---|
| [1. SSE 흐름](docs/1-sse-flow.md) | SSE가 어떤 문제를 풀고, WebSocket과 어떤 선택 차이가 있는지 정리 |
| [2. 로컬 핸즈온](docs/2-local-handson.md) | Docker Compose 실행, 브라우저 확인, `curl -N` 스트림 확인 |

## 빠른 실행

```bash
make up
```

브라우저에서 <http://localhost:8000>을 열거나 다음 명령으로 이벤트를 확인합니다.

```bash
make stream
```

종료:

```bash
make down
```
