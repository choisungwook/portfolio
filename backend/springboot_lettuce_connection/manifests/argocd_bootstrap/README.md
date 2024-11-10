# 개요
* springboot lettuce 라이브러리 장애 재현을 위한 ArgoCD Application bootstrap

# 전제조건
* ArgoCD가 설치되어 있어야 함

# 목차
* [ArgoCD 설치 후 초기 설정](./initialize.yaml)
* [springboot application](./springboot_application.yaml)
* [redis-cluster](./redis-cluster.yaml)

# 생성 방법

```sh
kubectl apply -f ./
```

# 삭제 방법

```sh
kubectl delete -f ./
```
