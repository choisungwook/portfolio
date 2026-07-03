# Docker Compose로 SSE를 어떻게 확인할까?

## TL;DR

Docker Compose로 FastAPI 서버를 실행하고, 브라우저와 `curl`로 이벤트가 끊기지 않고 도착하는지 확인합니다. 로컬 Python 실행은 `uv`를 사용합니다.

## 먼저 무엇을 실행할까요?

이 예제의 기본 실행 경로는 Docker Compose입니다. 로컬 Python 환경을 직접 맞추지 않아도 같은 명령으로 서버를 띄울 수 있습니다.

아래 명령은 이미지를 빌드하고 FastAPI 서버를 실행합니다.

```bash
make up-detached
```

서버가 실행되면 헬스 체크를 확인합니다.

```bash
curl http://localhost:8000/health
```

정상 응답은 다음과 같습니다.

```json
{"status":"ok"}
```

## 이벤트 스트림은 어떻게 볼까요?

SSE는 응답이 바로 끝나지 않습니다. `curl -N` 옵션으로 버퍼링을 줄이면 이벤트가 도착하는 대로 볼 수 있습니다.

아래 명령은 `/events` 스트림을 터미널에서 확인합니다.

```bash
make stream
```

출력은 대략 이런 형태로 이어집니다.

```text
id: 1
event: tick
data: {"id": 1, "service": "local-sse-demo", "message": "server event 1", "sent_at": "2026-07-03T00:00:00+00:00"}

id: 2
event: tick
data: {"id": 2, "service": "local-sse-demo", "message": "server event 2", "sent_at": "2026-07-03T00:00:01+00:00"}
```

종료는 `Ctrl+C`로 합니다.

## 브라우저에서는 무엇을 확인할까요?

브라우저에서 `http://localhost:8000`에 접속하면 `EventSource`가 `/events`에 연결합니다. 화면에는 서버가 보내는 `tick` 이벤트가 한 줄씩 쌓입니다.

이 방식의 장점은 실제 브라우저 API 흐름을 바로 볼 수 있다는 점입니다. 단점은 자동화된 검증 로그로 남기기에는 `curl`이나 CLI 클라이언트보다 불편하다는 점입니다.

## Python 클라이언트로도 볼 수 있을까요?

로컬에서 `uv`를 사용할 수 있으면 CLI 클라이언트로 이벤트 3개만 받고 종료할 수 있습니다.

아래 명령은 `/events`에서 `data` 줄만 3개 출력합니다.

```bash
make client
```

## 종료는 어떻게 할까요?

Docker Compose 리소스는 아래 명령으로 정리합니다.

```bash
make down
```

## 참고자료

- Docker Compose: <https://docs.docker.com/compose/>
- uv: <https://docs.astral.sh/uv/>
