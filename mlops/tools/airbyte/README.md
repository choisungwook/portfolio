# nginx ingress controller 설치
* ingress controller 설치

```sh
kubectl apply -k install/
```

* controlplane 노드에서 deployment에 nodeSelector 설정

```sh
nodeSelector:
  kubernetes.io/hostname: "kind-control-plane"
```

* 설치완료 대기

```sh
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```
