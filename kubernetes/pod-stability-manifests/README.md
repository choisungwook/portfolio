# 개요
* pod 안전성을 높이는 설정
* 블로그: https://malwareanalysis.tistory.com/743

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
kind delete cluster --name pod-stability
```
