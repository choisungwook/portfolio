# 실습 환경 준비: 맥 kind cluster

이 문서는 Track A의 환경을 만든다. [3-routing.md](3-routing.md)와 [4-trafficpolicy.md](4-trafficpolicy.md)는 여기서 만든 cluster를 전제로 한다. GPU 노드에서 하는 Track B는 [5-setup.md](5-setup.md)에 따로 있다.

## 사전 준비

- Docker Desktop 또는 colima
- kind, kubectl, helm

맥에 없으면 한 번에 설치한다.

```bash
brew install kind kubectl helm
```

## 버전

| 대상 | 버전 | 이유 |
|---|---|---|
| kgateway | v2.4.2 | 작성 시점 최신 stable |
| Gateway API | v1.6.1 | kgateway v2.4.2의 go.mod가 참조하는 버전 |
| kind 노드 이미지 | kind 기본값 | 고정하지 않는다. kind 버전에 맞는 기본 이미지를 쓴다 |

## cluster 생성

노드 하나짜리 cluster를 만든다. GPU 노드 한 대를 쓰는 Track B와 노드 수를 맞추기 위함이고, quickstart에 노드가 더 필요하지도 않다.

[kind-config.yaml](../manifests/kind/kind-config.yaml)은 NodePort 30080을 맥의 localhost:8080으로 내보낸다. kind에서 `LoadBalancer` service는 external IP를 못 받고 계속 Pending이므로, gateway를 NodePort로 고정하고 포트를 뚫어 두는 쪽이 단순하다.

```bash
kind create cluster --config manifests/kind/kind-config.yaml
```

## Gateway API CRD 설치

kgateway는 표준 CRD를 스스로 설치하지 않는다. 먼저 넣어야 한다.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

## kgateway 설치

CRD chart와 control plane chart가 나뉘어 있다. 순서를 바꾸면 control plane이 자기 CRD를 못 찾는다.

```bash
helm upgrade -i kgateway-crds oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds \
  --create-namespace --namespace kgateway-system --version v2.4.2
```

```bash
helm upgrade -i kgateway oci://cr.kgateway.dev/kgateway-dev/charts/kgateway \
  --namespace kgateway-system --version v2.4.2
```

## 설치 확인

control plane 파드가 Running이면 된다.

```bash
kubectl get pods -n kgateway-system
```

GatewayClass는 chart가 아니라 control plane이 직접 만든다. 그래서 이 목록이 비어 있지 않다는 것 자체가 control plane이 살아서 일을 시작했다는 신호다.

```bash
kubectl get gatewayclass
```

`kgateway`가 있으면 된다. chart가 관리하는 클래스는 `kgateway`와 Istio ambient waypoint용 `kgateway-waypoint` 둘인데, 이 핸즈온은 앞의 것만 쓴다.

## Gateway 생성

[gateway-parameters.yaml](../manifests/gateway/gateway-parameters.yaml)이 프록시 service를 NodePort 30080으로 고정한다. Gateway보다 먼저 있어야 첫 프록시가 뜰 때 반영된다.

```bash
kubectl apply -f manifests/gateway/gateway-parameters.yaml
```

[http-gateway.yaml](../manifests/gateway/http-gateway.yaml)은 8080 listener 하나를 열고, `infrastructure.parametersRef`로 위 GatewayParameters를 가리킨다.

```bash
kubectl apply -f manifests/gateway/http-gateway.yaml
```

Gateway를 만들면 kgateway가 같은 namespace에 Envoy Deployment와 Service를 새로 만든다. 이 파드가 실제 트래픽이 지나가는 곳이다.

```bash
kubectl get gateway,deploy,svc -n kgateway-system
```

`PROGRAMMED=True`가 되면 Envoy에 설정이 들어간 것이다. 아직 HTTPRoute가 없어 listener는 비어 있다.

## 정리

Track A가 끝나면 cluster째 지운다. 절차는 [7-cleanup.md](7-cleanup.md)에 있다.

## 다음

httpbin을 붙여 트래픽을 흘리는 [3-routing.md](3-routing.md)로 넘어간다.
