# Archive: HAProxy TCP proxy 실습

TL;DR: `client -> HAProxy(L4) -> server Pod` 구조에서 server Pod가 죽어도 client 연결을 유지하고 다른 살아있는 Pod로 stream을 이어 붙이려 했다. HAProxy `mode tcp`로는 이 목표를 만족하지 못했고, 이것은 HAProxy 버그가 아니라 L4 프록시의 근본 한계임을 확인하고 이 실습을 archive했다. 현재 active 실습은 같은 한계를 Envoy로 재확인하는 [Envoy 실습](../../docs/envoy-architecture.md)이다.

## 무엇을 검증하려 했는가

핵심 가설은 "full proxy(L4)가 client와 server 사이에 있으면, server Pod가 죽어도 client–proxy 소켓은 유지하고 proxy가 다른 살아있는 Pod로 같은 TCP stream을 이어 붙인다"였다. 이 가설을 일반 HAProxy Pod(Istio 아님)로 검증했다.

## 왜 안 되었는가

`mode tcp`(L4)에서 HAProxy는 client 연결과 backend 연결, 두 개의 독립된 TCP 연결을 byte 단위로 relay한다. backend Pod가 종료되면 backend 연결의 TCP state(시퀀스 번호, 버퍼)가 사라지고, 새 Pod는 이 state를 이어받을 수 없다. 그래서 `AUTO_RECONNECT=false` client에서 `server closed connection`이 발생했다.

이것은 설정 실수가 아니라 TCP 프로토콜의 근본 제약이다. 자세한 원리는 [TCP session migration 한계](../../docs/tcp-session-migration.md)에 정리했다. 같은 한계가 HAProxy, Envoy, NGINX 모두에 적용된다.

## 그래서 무엇을 바꿨는가

- 결론을 "L4 프록시로는 raw TCP session migration이 불가"로 확정했다.
- 같은 한계를 Envoy로 재현하고, Envoy가 Pod 단위 endpoint를 어떻게 다루는지(STRICT_DNS, health check, outlier detection)를 추가로 관측하는 [Envoy 실습](../../docs/envoy-architecture.md)으로 이동했다.
- raw TCP에서 client 연결 유지가 정말 필요하면 L4 교체가 아니라 L7 retry, client reconnect, 프로토콜 전용 proxy 중 하나가 필요하다는 방향을 문서화했다.

## 이 archive의 구성

| 경로 | 설명 |
|---|---|
| `manifests/haproxy/` | `haproxytech/haproxy` Helm chart values override (공통/local/eks) |
| `manifests/tcp-echo/` | HAProxy Service를 바라보는 `tcp-server`/`tcp-client` 단일 적용 manifest |
| `docs/haproxy.md` | HAProxy Helm values 설명 |
| `docs/haproxy-risks.md` | TCP mode 한계와 HA replica 종료 리스크 |
| `docs/local-hands-on.md` | kind 로컬 HAProxy 핸즈온 |
| `docs/eks-hands-on.md` | EKS NLB HAProxy 핸즈온 |
| `docs/session-hypothesis.md` | backend Pod 종료 시 client 세션 관측 절차 |

공용 리소스(`app/`, `kind/`, `terraform/`)와 일반 이론 문서(`docs/architecture.md`, `docs/tcp-session-migration.md` 등)는 archive하지 않고 Envoy 실습이 재사용한다.

## archive된 실습을 다시 돌리려면

앱은 archive 안의 HAProxy용 `tcp-echo` manifest로 한 번에 적용하고, HAProxy는 chart values로 설치한다. 모든 리소스는 default namespace에 둔다. repo 루트에서 실행한다.

```bash
helm repo add haproxytech https://haproxytech.github.io/helm-charts
helm repo update
kubectl apply -f archive/haproxy/manifests/tcp-echo/
helm upgrade --install tcp-echo-haproxy haproxytech/haproxy \
  --version 1.29.0 \
  -f archive/haproxy/manifests/haproxy/values.yaml \
  -f archive/haproxy/manifests/haproxy/values-local.yaml
```

EKS에서는 `values-local.yaml` 대신 `archive/haproxy/manifests/haproxy/values-eks.yaml`을 사용한다. 단계별 절차는 `docs/local-hands-on.md`와 `docs/eks-hands-on.md`를 본다.
