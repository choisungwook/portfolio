# 개요

* kind clsuter에서 유틸성 오픈소스 설치 방법

## metrics server 설치

* helm repo 추가

```sh
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
```

* helm chart 릴리즈

```sh
helm upgrade --install -f ./manifests/metrics-server/values.yaml -n kube-system metrics-server metrics-server/metrics-server
```

* 설치 확인

```sh
kubectl -n kube-system get pod -l app.kubernetes.io/instance=metrics-server
```

## nginx-ingress 설치

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```
