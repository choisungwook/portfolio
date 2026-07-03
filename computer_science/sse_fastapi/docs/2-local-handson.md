# Docker Compose로 FastAPI SSE를 어떻게 확인할까

SSE는 코드만 보면 단순해 보이지만, 실제로는 연결이 열린 상태로 유지되는지 직접 봐야 감이 옵니다. 이 문서는 Docker Compose로 서버를 실행하고, 브라우저와 `curl`에서 이벤트가 순서대로 도착하는지 확인합니다.

## 준비물은 무엇이 필요할까

로컬에는 Docker와 Docker Compose plugin이 필요합니다.

```bash
docker --version
docker compose version
```

Python 가상환경은 컨테이너 안에서 `uv`로 준비합니다. 호스트에 Python을 설치하지 않아도 실습 경로는 동작합니다.

## 서버는 어떻게 실행할까

작업 디렉터리로 이동합니다.

```bash
cd computer_science/sse_fastapi
```

컨테이너를 빌드하고 백그라운드로 실행합니다.

```bash
make up
```

실행 상태를 확인합니다.

```bash
docker compose ps
```

`sse-api` 서비스의 `0.0.0.0:8000->8000/tcp` 매핑이 보이면 브라우저에서 접근할 수 있습니다.

## 브라우저에서는 무엇을 볼까

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8000
```

화면에는 서버가 보낸 이벤트가 순서대로 추가됩니다. 브라우저 개발자 도구의 Network 탭에서 `/events` 요청을 보면 응답이 바로 끝나지 않고 유지됩니다.

확인할 포인트는 두 가지입니다.

1. `readyState`가 연결 상태로 유지되는가
2. `message` 이벤트가 1초 간격으로 쌓이는가

브라우저 확인의 장점은 실제 프론트엔드 사용 방식과 가깝다는 점입니다. 단점은 응답 헤더와 raw frame을 보기에는 `curl`보다 덜 직접적입니다.

## curl로는 무엇을 확인할까

SSE 스트림은 `curl -N`으로 확인합니다. `-N`은 curl의 출력 버퍼링을 끄기 때문에 이벤트가 도착하는 즉시 터미널에 보입니다.

```bash
make stream
```

직접 명령을 실행하면 다음과 같습니다.

```bash
curl -N http://localhost:8000/events
```

응답에는 `event`, `id`, `data`가 반복해서 보입니다.

```text
event: heartbeat
id: 1
data: {"event_id":1,"message":"server event 1","created_at":"..."}
```

헤더까지 확인하려면 다음 명령을 사용합니다.

```bash
curl -i -N http://localhost:8000/events
```

다음 값을 확인합니다.

```text
content-type: text/event-stream; charset=utf-8
cache-control: no-cache
connection: keep-alive
x-accel-buffering: no
```

## Python 클라이언트로는 어떻게 읽을까

브라우저가 아닌 클라이언트도 line 단위로 SSE frame을 읽을 수 있습니다.

```bash
make client
```

이 명령은 컨테이너 안에서 `src/sse_fastapi/client.py`를 실행합니다. 클라이언트는 `/events`에 연결한 뒤 빈 줄로 구분되는 SSE frame을 출력합니다.

## 종료와 정리는 어떻게 할까

실습이 끝나면 컨테이너를 내립니다.

```bash
make down
```

이미지까지 다시 만들고 싶으면 다음 순서로 실행합니다.

```bash
make down
docker compose build --no-cache
make up
```

## 문제가 생기면 어디를 볼까

포트 충돌이 나면 8000 포트를 쓰는 프로세스를 먼저 확인합니다.

```bash
lsof -i :8000
```

컨테이너 로그는 다음 명령으로 봅니다.

```bash
make logs
```

이 실습이 확인하는 핵심은 단순합니다. 브라우저나 `curl`이 `/events` 연결을 오래 유지하고, 서버가 같은 HTTP 응답 안에서 이벤트를 계속 밀어 넣는지 보는 것입니다. 이 흐름을 확인하면 polling, SSE, WebSocket 중 SSE가 들어갈 자리를 더 구체적으로 판단할 수 있습니다.
