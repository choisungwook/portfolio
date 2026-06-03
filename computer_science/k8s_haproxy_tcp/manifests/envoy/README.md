# Envoy Helm Chart

TL;DR: 이 디렉터리는 standalone Envoy를 설치하는 로컬 Helm chart다. Envoy Gateway, Istio, Ingress Controller를 쓰지 않는다. `values.yaml`의 `config`가 실제 `envoy.yaml`이고, local/EKS Service 차이만 override한다.

## 파일

| 파일 | 용도 |
|---|---|
| `Chart.yaml` | 로컬 Helm chart metadata |
| `values.yaml` | Envoy 이미지, replica, ConfigMap config, 기본 Service 설정 |
| `values-local.yaml` | kind 로컬용 NodePort `32090` override |
| `values-eks.yaml` | EKS용 LoadBalancer/NLB annotation override |
| `templates/` | ConfigMap, Deployment, Service, admin Service template |

## 로컬 설치

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-local.yaml
```

## EKS 설치

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-eks.yaml
```

## 핵심 설계

- `tcp_proxy`는 L4 필터다. opaque byte stream을 relay하므로 backend가 죽으면 동일 stream을 다른 Pod로 이어주지 못한다.
- `STRICT_DNS` + headless Service 조합으로 Envoy가 server Pod IP를 개별 endpoint로 본다.
- active `tcp_health_check`와 `outlier_detection`은 새 연결을 건강한 Pod로 보내는 장치이지, 기존 연결을 이전하는 장치가 아니다.

## 설정 변경 후 반영

`values.yaml`의 `config`를 바꾼 뒤 Helm upgrade를 다시 실행한다.

```bash
helm upgrade --install tcp-echo-envoy manifests/envoy \
  -f manifests/envoy/values.yaml \
  -f manifests/envoy/values-local.yaml
```
