# 개요
* kind cluster로 ArgoCD 설치

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

# helm chart 릴리즈

* helm repo 추가

```sh
helm repo add argo https://argoproj.github.io/argo-helm
```

* helm chart 릴리즈

```bash
helm upgrade --install argocd argo/argo-cd \
  -n argocd --create-namespace \
  -f values.yaml
```

* 로컬pc의 /etc/hosts파일을 수정

```sh
```

# argocd 비밀번호

```sh
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

# kind 클러스터 삭제

```sh
kind delete cluster --name argocd
```
