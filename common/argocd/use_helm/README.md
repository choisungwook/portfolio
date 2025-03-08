# 개요
* helm chart로 ArgoCD 설치

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
