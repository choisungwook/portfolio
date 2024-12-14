# 개요
* helm으로 istio 설치

# 설치 방법
1. **istio-base** helm chart 릴리즈
2. **istiod helm** chart 릴리즈
3. **istio-ingress** chart 릴리즈
4. **(옵션) istio-egress** helm chart 릴리즈


```sh
helm repo add istio https://istio-release.storage.googleapis.com/charts
helm repo update
```

* helm chart 릴리즈

```sh
helm install istio-base istio/base --version 1.24.0 -n istio-system --create-namespace --set defaultRevision=default
helm install istiod istio/istiod --version 1.24.0 -n istio-system --create-namespace --wait
helm install istio-ingress istio/gateway --version 1.24.0 -n istio-system --create-namespace --wait
```
