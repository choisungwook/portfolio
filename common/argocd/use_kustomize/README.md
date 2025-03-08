# 개요
* kustomize로 ArgoCD를 설치

# 전제조건
* [제가 만든 EKS 모듈](https://github.com/choisungwook/terraform_practice/tree/main/eks/module)를 사용했다는 전제로 ArgoCD를 설치합니다.
* ingress를 사용하려면 External DNS가 설치되어 있어야 합니다.

# 설치 방법


## kustomize로 설치

1. argocd namespace 생성

```sh
kubectl create ns argocd
```

2. kusotmize 배포

```sh
kubectl kustomize ./ | kubectl apply -f -
```

# admin 비밀번호 조회
```sh
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

# ingress 추가
* [ALB controller와 External DNS controller](../../argocd_bootstrap/root-applicationset.yaml) 설치 후 ArgoCD ingress 생성

* [pathces/argocd-ingress.yaml](./patches/argocd-ingress.yaml)파일에서 ACM과 ingress hosts수정

```sh
$ vi ./pathces/argocd-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-ingress
  namespace: argocd
  annotations:
    alb.ingress.kubernetes.io/certificate-arn: {your ACM arn}
spec:
  ingressClassName: alb
  rules:
  - host: {your domain}
```

# 삭제

```sh
kubectl kustomize ./ | kubectl delete -f -
```
