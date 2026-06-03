# Kubernetes Manifests

TL;DR: 앱은 `choisungwook/tcp-server:v0.1.0`과 `choisungwook/tcp-client:v0.1.0` 이미지로 분리한다. default namespace에서 `kubectl apply -f manifests/tcp-echo/` 한 번으로 배포하고 삭제한다. Envoy proxy는 standalone Helm chart(`manifests/envoy/`)로 설치한다. 이전 HAProxy 구성은 [`archive/haproxy/`](../archive/haproxy/README.md)에 있다.

## 디렉터리 구조

| 디렉터리 | 설명 |
|---|---|
| `tcp-echo/` | server Service, server headless Service, graceful server Deployment, interval client Deployment |
| `envoy/` | standalone Envoy Helm chart와 local/EKS values override |

## 앱 배포와 삭제

server와 client는 분리해서 적용하지 않는다.

```bash
kubectl apply -f manifests/tcp-echo/
kubectl delete -f manifests/tcp-echo/ --ignore-not-found
```

client Pod는 Envoy Service의 TCP port가 열릴 때까지 initContainer에서 기다린 뒤 `AUTO_RECONNECT=false` client를 시작한다.

## Envoy 배포

로컬 kind에서는 NodePort override를 사용한다.

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-local.yaml
```

EKS에서는 LoadBalancer/NLB override를 사용한다.

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-eks.yaml
```

삭제는 release 단위로 한다.

```bash
helm uninstall tcp-echo-envoy --ignore-not-found
```
