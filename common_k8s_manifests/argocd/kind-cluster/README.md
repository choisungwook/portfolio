# 개요
* ArgoCD 테스트를 위한 kind cluster 생성

# kind 클러스터 생성

> 주의: 쿠버네티스 노드 개수가 2개 이상이면 nginx ingress controller가 올바르게 동작하지 않음

```sh
kind create cluster --config kind-config.yaml
```

# nginx ingress controller 설치
* ingress controller 설치

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

* deployment에 nodeSelector 설정

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
