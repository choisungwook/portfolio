# SSE FastAPI Docker Compose 핸즈온

SSE(Server-Sent Events)가 HTTP 연결 하나로 서버 이벤트를 계속 흘려보내는 방식을 FastAPI와 Docker Compose로 직접 확인하는 것이 목적입니다.

## 문서

- [1. SSE 서버는 왜 HTTP 응답을 끝내지 않을까](./docs/1-sse-server.md)
- [2. Docker Compose로 어떻게 재현할까](./docs/2-docker-compose.md)
- [3. 클라이언트는 이벤트 스트림을 어떻게 확인할까](./docs/3-client-check.md)

## 실행

로컬 실행은 Docker Compose를 기본 경로로 사용합니다.

```bash
make up
make client
make down
```
