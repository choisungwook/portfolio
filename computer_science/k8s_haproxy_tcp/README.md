---
status: draft
created: 2026-05-31
updated: 2026-06-03
tags:
  - kubernetes
  - envoy
  - haproxy
  - tcp
---

# k8s-haproxy-tcp

TL;DR: `client -> L4 TCP proxy -> server Pod(replica>1)` 구조에서 server Pod 종료가 장기 raw TCP client 세션에 어떤 영향을 주는지 검증하는 실습이다. 모든 예제는 default namespace를 사용한다. 앱은 `tcp-server`와 `tcp-client` 이미지로 분리하고 `kubectl apply -f manifests/tcp-echo/` 한 번으로 배포한다. active proxy인 Envoy는 로컬 Helm chart로 설치한다. HAProxy 결과는 [archive](archive/haproxy/README.md)에 남겼다.

## 현재 실습: Envoy

| 문서 | 내용 |
|---|---|
| [Envoy 아키텍처](docs/envoy-architecture.md) | client, Envoy, server Pod 경로와 검증 가설, HAProxy와의 차이 |
| [Envoy 설정](docs/envoy-config.md) | `envoy.yaml` static config: listener, tcp_proxy, STRICT_DNS, health check, outlier detection |
| [Envoy 로컬 kind 핸즈온](docs/envoy-local-hands-on.md) | kind 배포, server Pod 재시작 실험, admin `/clusters` 관측 |
| [Envoy EKS 핸즈온](docs/envoy-eks-hands-on.md) | Terraform EKS, NLB 경로 재검증, NLB idle timeout 측정 |
| [Kubernetes manifests](manifests/README.md) | `tcp-echo/` 단일 적용 디렉터리와 Envoy Helm chart 구조 |
| [EKS Terraform](terraform/README.md) | EKS 핸즈온용 Terraform 실행 순서와 출력값 사용 |

## 공통 이론

| 문서 | 내용 |
|---|---|
| [아키텍처](docs/architecture.md) | L4 TCP proxy 경로의 공통 개념과 검증 가설, HA replica의 의미 |
| [TCP 앱](docs/tcp-app.md) | 분리된 Python server/client 소스, 이미지, 실행 옵션 |
| [TCP session migration 한계](docs/tcp-session-migration.md) | L4가 live stream을 이전하지 못하는 근본 이유와 L7/프로토콜 proxy 대안 |
| [Graceful shutdown](docs/graceful-shutdown.md) | graceful/nograceful manifest 차이와 관찰 방법 |
| [OS 소켓 재정리](docs/os-socket-cleanup.md) | idle timeout, TCP keepalive, TIME_WAIT 구분 |
| [RDS Proxy 비교](docs/usecase-rdsproxy.md) | RDS Proxy의 connection pooling, multiplexing, pinning 원리와 현재 구조 비교 |

## Archive: HAProxy

| 문서 | 내용 |
|---|---|
| [Archive 개요](archive/haproxy/README.md) | HAProxy 실습을 archive한 이유와 결론, 다시 돌리는 법 |
| [HAProxy 설정](archive/haproxy/docs/haproxy.md) | HAProxy Helm values, NodePort/NLB override |
| [HAProxy 로컬 핸즈온](archive/haproxy/docs/local-hands-on.md) | kind 로컬 HAProxy 배포와 server Pod 재시작 실험 |
| [HAProxy EKS 핸즈온](archive/haproxy/docs/eks-hands-on.md) | EKS NLB 경로 HAProxy 재검증 |
| [HAProxy 가설 검증](archive/haproxy/docs/session-hypothesis.md) | backend Pod 종료 시 client 세션 관측 절차 |
| [HAProxy 리스크](archive/haproxy/docs/haproxy-risks.md) | TCP mode 한계와 HA replica 종료 리스크 |
