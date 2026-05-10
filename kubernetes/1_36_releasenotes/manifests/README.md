# Kubernetes 1.36 release notes manifests

## 예제 설명

| 디렉터리/파일 | 설명 |
|---|---|
| `mutating-admission-policy.yaml` | pod 생성 시 Kubernetes 1.36 확인 label을 추가하는 MutatingAdmissionPolicy |
| `mutating-admission-policy-binding.yaml` | MutatingAdmissionPolicy를 활성화하는 binding |
| `sample-pod.yaml` | MutatingAdmissionPolicy 동작 확인용 pod |
| `user-namespace-pod.yaml` | `hostUsers: false` User Namespaces 확인용 pod |
| `deprecated-external-ip-service.yaml` | `Service.spec.externalIPs` deprecation warning 확인용 service |
| `gitrepo-volume-pod.yaml` | v1.36에서 disabled된 `gitRepo` volume plugin 확인용 pod |
