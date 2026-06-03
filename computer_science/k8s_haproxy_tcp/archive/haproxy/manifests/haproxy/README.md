# HAProxy Helm Values

TL;DR: `haproxytech/haproxy` chart를 사용하고, 이 디렉터리에는 chart template이 아니라 values override만 둔다. Kubernetes Ingress Controller chart는 사용하지 않는다.

| 파일 | 용도 |
|---|---|
| `values.yaml` | 공통 HAProxy config, image, replica, probe, resource 설정 |
| `values-local.yaml` | kind 로컬 검증용 NodePort override |
| `values-eks.yaml` | EKS 검증용 LoadBalancer/NLB override |

로컬 kind에서는 다음 순서로 override한다.

```bash
helm upgrade --install tcp-echo-haproxy haproxytech/haproxy \
  --version 1.29.0 \
  -f archive/haproxy/manifests/haproxy/values.yaml \
  -f archive/haproxy/manifests/haproxy/values-local.yaml
```

EKS에서는 `values-local.yaml` 대신 `values-eks.yaml`을 사용한다.
