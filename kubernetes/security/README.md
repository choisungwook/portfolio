# 개요
* 쿠버네티스 보안

# 실습 환경 구축

* kind cluster 생성

```sh
kind create cluster --config kind-config.yaml
```

* nginx ingress controller 설치

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

* kind cluster 삭제

```sh
kind delete cluster --name security
```
