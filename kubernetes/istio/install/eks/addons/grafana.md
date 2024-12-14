## 개요
* istio mesh메트릭을 시각화하기 위해 grafana 설치

## 전제조건
* proemtheus가 설치되어 있어야 함
* [설치 문서 바로가기](./prometheus.md)

## 설치방법
* helm values에서 AWS ACM과 host를 꼭 여러분 껄로 변경하세요!!!

```sh
helm repo add grafana https://grafana.github.io/helm-charts
helm upgrade --install \
  --version '8.6.1' \
  -n istio-system --create-namespace \
  -f ../argocd_bootstrap/values/grafana.yaml \
  grafana grafana/grafana
```

## 그라파나 admin 비밀번호

```sh
kubectl get secret --namespace istio-system grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```
