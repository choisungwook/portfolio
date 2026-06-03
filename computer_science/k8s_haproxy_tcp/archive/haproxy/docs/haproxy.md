# HAProxy 설정

TL;DR: Kubernetes Ingress Controller를 사용하지 않는다. `haproxytech/haproxy` Helm chart를 일반 HAProxy application chart로 설치하고, `archive/haproxy/manifests/haproxy/`에는 values override만 둔다.

## Chart 선택

사용 chart는 `haproxytech/haproxy`다. 공식 README 기준으로 이 chart는 HAProxy Kubernetes Ingress Controller chart와 달리 HAProxy를 일반 application으로 설치한다.

```bash
helm repo add haproxytech https://haproxytech.github.io/helm-charts
helm repo update
```

장점: Deployment, Service, ConfigMap template을 직접 소유하지 않고 chart values로 HAProxy 설정만 관리한다.

단점: chart values schema와 chart version에 의존한다. 그래서 핸즈온에서는 `--version 1.29.0`으로 chart version을 고정한다.

## Values 구성

| 파일 | 역할 |
|---|---|
| `archive/haproxy/manifests/haproxy/values.yaml` | 공통 HAProxy config, image, replica, probe, resource 설정 |
| `archive/haproxy/manifests/haproxy/values-local.yaml` | kind 로컬 검증용 NodePort override |
| `archive/haproxy/manifests/haproxy/values-eks.yaml` | EKS 검증용 LoadBalancer/NLB override |

`values.yaml`의 `config` 값은 HAProxy TCP 설정을 담는다.

```text
frontend tcp_echo_frontend
  bind *:2000
  default_backend tcp_echo_backend

backend tcp_echo_backend
  server tcp-echo tcp-echo-server:9090 check
```

## 공통 설정

| 항목 | 값 |
|---|---|
| release name | `tcp-echo-haproxy` |
| chart | `haproxytech/haproxy` |
| chart version | `1.29.0` |
| image | `haproxy:3.2-alpine` |
| replicas | 2 |
| timeout-client/server | `10m` |
| frontend port | `2000` |
| stats port | `8404` |

## 로컬 노출

kind 로컬 검증에서는 공통 values에 `values-local.yaml`을 추가로 적용한다. 이 override는 Service type을 `NodePort`로 바꾸고 TCP port `2000`의 nodePort를 `32090`으로 고정한다.

```bash
helm upgrade --install tcp-echo-haproxy haproxytech/haproxy \
  --version 1.29.0 \
  -f archive/haproxy/manifests/haproxy/values.yaml \
  -f archive/haproxy/manifests/haproxy/values-local.yaml
kubectl get svc tcp-echo-haproxy
```

kind의 `kind/cluster.yaml`은 host `localhost:2000`을 NodePort `32090`에 연결한다.

## EKS 노출

EKS 검증에서는 공통 values에 `values-eks.yaml`을 추가로 적용한다. 이 override는 Service type을 `LoadBalancer`로 바꾸고 NLB annotation을 설정한다.

```bash
helm upgrade --install tcp-echo-haproxy haproxytech/haproxy \
  --version 1.29.0 \
  -f archive/haproxy/manifests/haproxy/values.yaml \
  -f archive/haproxy/manifests/haproxy/values-eks.yaml
kubectl get svc tcp-echo-haproxy
```

확인 필요: 실제 NLB annotation 지원 범위는 EKS 클러스터의 LoadBalancer 구현 방식에 따라 달라질 수 있다.

## 로그와 stats

HAProxy stats UI는 session 수와 backend health를 보는 보조 화면이다. 이 실습의 최종 판정은 client 로그에 `connection-error`가 없는지로 한다.

```bash
kubectl logs deploy/tcp-echo-haproxy -f
kubectl port-forward svc/tcp-echo-haproxy 8404:8404
```

stats UI는 `http://127.0.0.1:8404/stats`에서 확인한다.

| UI에서 볼 것 | 해석 |
|---|---|
| `tcp_echo_frontend` Session `Cur`/`Total` | client가 HAProxy에 붙어 있는지, 새 session이 늘었는지 |
| `tcp_echo_backend` Session `Cur`/`Total` | HAProxy가 backend 쪽 TCP 연결을 유지 중인지, 재연결이 발생했는지 |
| `tcp_echo_backend/tcp-echo` `Status`, `LastChk` | server Service에 대한 TCP health check 결과 |
| `Errors`, `Warnings`, `Downtime` | backend 연결 실패나 health check 변동이 있었는지 |

확인 필요: backend가 개별 Pod가 아니라 `tcp-echo-server` Service DNS 하나이므로 stats UI는 Pod별 handoff를 보여주지 않는다. HAProxy replica도 2개라 stats UI는 접속된 HAProxy Pod의 관측값만 보여준다.

## 장단점

장점: 실험 대상이 HAProxy 자체이므로 controller abstraction 없이 TCP proxy 동작을 관찰할 수 있다. 또한 chart upgrade와 values override 경로가 명확하다.

단점: Pod endpoint 변화를 직접 반영하는 controller가 없으므로 backend를 Service DNS로 두고 Kubernetes Service가 endpoint 선택을 맡는다. Chart version을 올리면 values schema 변경 여부를 확인해야 한다.
