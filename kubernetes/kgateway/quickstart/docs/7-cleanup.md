# 정리

## Track A: 맥 kind

cluster를 지우면 안에 있던 것이 전부 사라진다. 리소스를 하나씩 지울 이유가 없다.

```bash
kind delete cluster --name kgateway
```

## Track B: GPU 노드

노드를 재사용해야 하므로 필요한 것만 지운다. GPU를 먼저 놓아 주는 순서가 중요하다. vLLM 파드가 살아 있는 동안은 GPU가 계속 잡혀 있다.

```bash
kubectl delete namespace llm
```

GPU가 실제로 풀렸는지 확인한다.

```bash
kubectl describe node | grep -A5 "Allocated resources"
```

kgateway와 Gateway를 지운다. Gateway를 지우면 그 Gateway가 만든 Envoy Deployment와 Service도 같이 사라진다.

```bash
kubectl delete -f manifests/gateway/http-gateway.yaml
kubectl delete -f manifests/gateway/gateway-parameters.yaml
helm uninstall kgateway -n kgateway-system
helm uninstall kgateway-crds -n kgateway-system
kubectl delete namespace kgateway-system
```

Gateway API CRD까지 지운다. 다른 gateway 구현체를 쓸 계획이면 남겨 둔다.

```bash
kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

k3s째 없앨 때는 설치 스크립트가 남긴 uninstall 스크립트를 쓴다.

```bash
/usr/local/bin/k3s-uninstall.sh
```
