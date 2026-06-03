# TCP 앱

TL;DR: TCP echo server와 interval/manual client는 소스와 Docker image를 분리한다. server 이미지는 `choisungwook/tcp-server:v0.1.0`, client 이미지는 `choisungwook/tcp-client:v0.1.0`이다. server 응답에는 backend Pod hostname이 포함되어 backend 교체를 관찰할 수 있다.

## 디렉터리

| 경로 | 내용 |
|---|---|
| `app/tcp-server/server.py` | line 기반 TCP echo server |
| `app/tcp-server/Dockerfile` | server 전용 이미지 |
| `app/tcp-client/client.py` | interval/manual TCP client |
| `app/tcp-client/Dockerfile` | client 전용 이미지 |

## Image build

repo root에서 두 이미지를 함께 빌드한다.

```bash
make build
```

`app/` 디렉터리에서 직접 빌드할 수도 있다.

```bash
cd app
make build
```

EKS처럼 원격 registry pull이 필요하면 두 이미지를 함께 push한다.

```bash
cd app
make push
```

## Server

server는 `PORT` 환경변수로 지정한 TCP 포트에서 listen한다. 메시지는 newline으로 구분한다.

응답 형식은 다음과 같다.

```text
hostname=<pod-hostname> pid=<pid> conn=<connection-id> msg=<message>
```

server를 로컬에서 실행한다.

```bash
cd app
uv run python tcp-server/server.py
```

## Client interval mode

`MODE=interval`은 하나의 TCP connection을 유지하고 `INTERVAL_SECONDS`마다 같은 메시지를 보낸다.

```bash
cd app
HOST=127.0.0.1 PORT=9090 MODE=interval INTERVAL_SECONDS=5 uv run python tcp-client/client.py
```

## Client manual mode

`MODE=manual`은 stdin에서 입력한 줄을 전송한다.

```bash
cd app
HOST=127.0.0.1 PORT=9090 MODE=manual uv run python tcp-client/client.py
```

## 주요 환경변수

| 환경변수 | 기본값 | 설명 |
|---|---:|---|
| `HOST` | `127.0.0.1` | client가 접속할 host |
| `PORT` | `9090` | server listen 또는 client 접속 port |
| `MODE` | `interval` | `interval` 또는 `manual` |
| `MESSAGE` | `helloworld` | interval mode에서 보낼 메시지 |
| `INTERVAL_SECONDS` | `5` | interval mode 전송 간격 |
| `AUTO_RECONNECT` | `false` | 연결 오류 후 재접속 여부 |
| `ENABLE_TCP_KEEPALIVE` | `false` | client socket `SO_KEEPALIVE` 활성화 |

## 검증 포인트

`AUTO_RECONNECT=false`가 기본값인 이유는 "client가 proxy에 붙어 있으면 server Pod 재시작 중에도 close가 없어야 한다"는 요구사항을 검증하기 위해서다. 재접속 동작을 별도로 확인할 때만 `AUTO_RECONNECT=true`를 사용한다.
