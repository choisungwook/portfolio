# OS 소켓 재정리

TL;DR: 설계에서 말한 "사용하지 않는 소켓 재정리"는 상황에 따라 idle timeout, TCP keepalive, FIN/RST, TIME_WAIT 회수 중 하나일 수 있다. 이 실습에서는 idle timeout과 keepalive를 우선 검증한다.

## 개념 구분

| 개념 | 의미 | client 영향 |
|---|---|---|
| Idle timeout | 일정 시간 데이터가 없으면 중간 장비나 proxy가 connection state를 지움 | 이후 데이터 전송 시 RST 또는 timeout |
| TCP keepalive | OS가 유휴 TCP 연결 생존 여부를 probe | idle timeout timer를 갱신하거나 죽은 peer 감지 |
| FIN | 정상적인 연결 종료 | read가 EOF를 받고 socket 종료 |
| RST | 비정상 또는 강제 종료 | 다음 read/write가 connection reset |
| TIME_WAIT | TCP 종료 후 delayed segment 처리를 위한 상태 | 보통 같은 4-tuple 재사용 지연 |

## 로컬 수동 트리거

Envoy `tcp_proxy`의 `idle_timeout`을 짧게 줄여 idle timeout을 빠르게 재현할 수 있다. `manifests/envoy/values.yaml`의 `config` 안에 있는 `idle_timeout: 600s`를 `idle_timeout: 15s`로 바꾼다.

바꾼 values로 Helm upgrade를 다시 실행해 새 ConfigMap을 반영한다.

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-local.yaml
```

client를 manual mode로 연결한 뒤 15초 이상 idle 상태로 둔다.

```bash
HOST=127.0.0.1 PORT=2000 MODE=manual uv run --project app python app/tcp-client/client.py
```

확인이 끝나면 `idle_timeout`을 원래 값(`600s`)으로 되돌리고 같은 방식으로 재적용한다.

## Keepalive 확인

client에서 `SO_KEEPALIVE`를 켠다.

```bash
HOST=127.0.0.1 PORT=2000 MODE=interval ENABLE_TCP_KEEPALIVE=true uv run --project app python app/tcp-client/client.py
```

Linux client에서는 timer를 확인한다.

```bash
ss -otnp | grep ':2000'
```

## AWS NLB 확인

AWS NLB TCP idle timeout은 listener attribute `tcp.idle_timeout.seconds`로 설정한다. 기본값은 350초이고, TCP listener는 60초에서 6000초 사이로 조정할 수 있다.

EKS에서 이 값을 짧게 줄여 재현할 때는 `manifests/envoy/values-eks.yaml`의 annotation을 바꾼다.

```yaml
service.beta.kubernetes.io/aws-load-balancer-listener-attributes.TCP-2000: tcp.idle_timeout.seconds=60
```

확인 필요: 실제 NLB listener attribute 지원 여부와 idle timeout은 로컬 kind로 볼 수 없으므로 Phase 8에서만 확정한다.
