# TCP Session Migration 한계와 대안

TL;DR: L4(TCP) 프록시는 backend가 죽어도 client 연결을 유지하는 "session migration"을 제공하지 않는다. 이것은 HAProxy 구현 문제가 아니라 TCP 프로토콜의 근본 제약이다. L7(application layer)로 올라가면 request 단위로 retry가 가능하다.

## TCP Session Migration이 불가능한 이유

HAProxy TCP mode는 두 개의 독립된 TCP 연결을 byte 단위로 relay한다.

```text
client ←[연결 A]→ HAProxy ←[연결 B]→ backend pod
```

TCP 연결은 4-tuple로 식별된다.

```text
연결 A: (client IP, client port, haproxy IP, haproxy port)
연결 B: (haproxy IP, haproxy port, backend IP, backend port)
```

backend pod가 종료되면 연결 B의 TCP state(시퀀스 번호, 수신/송신 버퍼)가 사라진다. 새 pod는 이 state를 이어받을 수 없다. HAProxy가 연결 A를 계속 들고 있더라도, 새 pod와의 연결 B'를 연결 A의 byte stream에 이어 붙이는 것은 불가능하다.

```text
client ──[연결 A 유지]──→ HAProxy ──[연결 B 끊김]──→ 종료된 pod
                                   ↘[연결 B' 신규]──→ 새 pod
                                   ↑
              연결 A ↔ 연결 B'를 이어주는 것이 TCP 프로토콜상 불가능
              새 pod는 이전 TCP state를 알 수 없음
```

이 한계는 HAProxy, Envoy, NGINX 모두에 동일하게 적용된다.

## HAProxy의 관련 옵션과 한계

HAProxy에는 backend 장애 대응 옵션이 있지만, 기존에 수립된 연결에는 적용되지 않는다.

| 옵션 | 실제 의미 | session migration 여부 |
|---|---|---|
| `option redispatch` | 연결 수립 실패 시 다른 backend로 재시도 | 기존 연결에는 미적용 |
| `retries N` | backend 연결 실패 시 N회 재시도 | 연결 수립 단계에만 적용 |
| `balance roundrobin` | 새 backend 연결 선택 방식 | 기존 stream 이전 아님 |
| `option tcp-check` | backend health check | 기존 stream 이전 아님 |
| `timeout client/server` | idle 연결 유지 시간 | backend 사망 시 이전 아님 |

`option redispatch`는 연결을 맺는 시점에만 동작한다. 이미 relay 중인 TCP stream의 backend가 죽으면 client까지 FIN 또는 RST가 전달된다.

## L7에서는 가능한 이유

프록시가 application 프로토콜을 이해하면 request 단위로 쪼개서 처리할 수 있다.

```text
client ──[HTTP 연결 유지]──→ HAProxy(HTTP mode) ──[request 버퍼링]──→ backend

backend 장애 발생:
  1. HAProxy가 request를 버퍼에 들고 있음
  2. 새 backend로 같은 request 재전송
  3. response를 client에 반환
  4. client 연결은 끊기지 않음
```

이것이 가능한 조건은 다음과 같다.

- 프록시가 request의 시작과 끝을 알 수 있어야 한다 (HTTP header, Content-Length 등)
- request가 idempotent하거나 retry 가능해야 한다
- 새 backend가 이전 연결 상태 없이 요청을 처리할 수 있어야 한다

## 프록시 종류별 비교

| 프록시 | TCP mode (L4) | HTTP mode (L7) |
|---|---|---|
| HAProxy | backend 죽으면 client도 끊김 | `retries` + `option redispatch`로 재시도 가능 |
| Envoy | 동일 | `retry_policy`로 재시도 가능 |
| NGINX stream | 동일 | `proxy_next_upstream`으로 재시도 가능 |

Envoy는 TCP proxy filter에서 outlier detection과 health check를 제공하지만, 기존 TCP session을 새 backend로 이전하지는 않는다.

## 프로토콜 전용 프록시

특정 프로토콜을 완전히 이해하는 프록시는 TCP 위에서도 session을 유지한다.

| 프록시 | 대상 프로토콜 | 동작 |
|---|---|---|
| PgBouncer | PostgreSQL | client connection pool 유지, backend 교체 시 handshake 재수행 |
| AWS RDS Proxy | MySQL / PostgreSQL | 동일 |
| Envoy MySQL filter | MySQL | 프로토콜 인식 후 handshake 재수행 |

이들이 가능한 이유는 프로토콜의 시작 지점(handshake)부터 다시 수행할 수 있기 때문이다. 범용 TCP stream은 "어디서부터 다시 시작"인지 프록시가 알 수 없다.

## 이 실험에의 적용

이 실험은 raw TCP echo 프로토콜을 사용하므로 L4 프록시의 한계가 그대로 드러난다.

| 실험 조건 | 결과 |
|---|---|
| HAProxy TCP mode + backend pod 재시작 | `AUTO_RECONNECT=false`에서 `server closed connection` 발생 (archive) |
| Envoy TCP mode + backend pod 재시작 | HAProxy와 동일하게 `server closed connection` 발생. L4의 일반 성질임을 재확인 |
| L7 프록시 + HTTP echo + backend pod 재시작 | request 재시도로 client 연결 유지 가능 |
| protocol-aware proxy + 프로토콜 handshake 지원 | session 유지 가능 (해당 프로토콜 한정) |

이 실험에서 `server closed connection`이 발생하는 것은 요구사항 미충족이며, HAProxy TCP mode가 live stream handoff를 제공하지 않는다는 관찰 결과다. 이것은 misconfiguration이 아니라 L4 프록시의 근본 한계다.

## 결론

- TCP L4 프록시: backend 교체 시 client session 유지 불가. HAProxy, Envoy, NGINX 모두 동일
- HTTP L7 프록시: request 단위 retry로 client 연결 유지 가능. 프로토콜이 HTTP이어야 함
- 프로토콜 전용 프록시: 해당 프로토콜의 handshake를 재수행하여 session 유지 가능
- client reconnect(`AUTO_RECONNECT=true`): client가 연결 끊김을 정상 경로로 처리하는 방식. TCP 한계를 우회하는 현실적인 대안
