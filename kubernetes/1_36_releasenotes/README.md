# Kubernetes 1.36 릴리즈노트

작성 기준: 2026-05-10

Kubernetes v1.36.0은 2026-04-22에 릴리즈된 정식 버전입니다. 공식 release page 기준으로 1.36 라인의 최신 릴리즈는 아직 `1.36.0`이고, patch release는 없습니다.

## 목적

- Kubernetes 1.36에서 새로 stable/beta/alpha가 된 기능을 운영 관점으로 정리한다.
- deprecated 또는 removed 항목이 운영 환경에 어떤 영향을 주는지 확인한다.
- k3d cluster에서 확인할 수 있는 실습을 남긴다.

## 문서 인덱스

| 문서 | 설명 |
|---|---|
| [docs/release-summary.md](./docs/release-summary.md) | 1.36 릴리즈 규모, 주요 기능, 운영 영향 요약 |
| [docs/deprecations-removals.md](./docs/deprecations-removals.md) | deprecated/removed 항목과 업그레이드 전 점검 명령 |
| [docs/node-cgroup-v2.md](./docs/node-cgroup-v2.md) | node cgroup v2, PSI metrics, MemoryQoS 변화 정리 |
| [docs/k3d.md](./docs/k3d.md) | k3s v1.36.0+k3s1 기반 k3d cluster 구성 |
| [docs/hands-on.md](./docs/hands-on.md) | MutatingAdmissionPolicy, User Namespaces, statusz/flagz, externalIPs, gitRepo 실습 |
| [manifests/README.md](./manifests/README.md) | 실습 manifest 인덱스 |

## 한 줄 결론

- admission, node isolation, storage, DRA, observability 쪽 기능이 많이 올라왔다.
- 운영자가 바로 봐야 할 항목은 `Service.spec.externalIPs` deprecation, `gitRepo` volume plugin 비활성화, flex-volume kubeadm 지원 제거, metric rename이다.
- 실습은 `rancher/k3s:v1.36.0-k3s1` image를 사용하는 k3d 기준으로 진행한다.
- DRA, VolumeGroupSnapshot, SELinux volume label, ServiceAccount token external signer는 실제 CSI/DRA/runtime/OS 조건이 더 중요해서 로컬 실습에서는 개념과 API 확인 위주로 둔다.

## 빠른 시작

k3d v5.8.3 이상과 k3s v1.36.0 image를 사용한다.

```sh
k3d cluster create k8s-136 \
  --image rancher/k3s:v1.36.0-k3s1
```

cluster 버전을 확인한다.

```sh
kubectl version
kubectl get nodes -o wide
```

## 참고자료

- Kubernetes v1.36 릴리즈 블로그: <https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/>
- Kubernetes v1.36 changelog: <https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/CHANGELOG-1.36.md#changelog-since-v1350>
- Kubernetes cgroup v2 공식 문서: <https://kubernetes.io/docs/concepts/architecture/cgroups/>
- Kubernetes PSI metrics 공식 문서: <https://kubernetes.io/docs/reference/instrumentation/understand-psi-metrics/>
- Kubernetes v1.36 MemoryQoS 블로그: <https://kubernetes.io/blog/2026/04/29/kubernetes-v1-36-memory-qos-tiered-protection/>
- Kubernetes release page: <https://kubernetes.io/releases/>
- k3s v1.36.0+k3s1 release: <https://github.com/k3s-io/k3s/releases/tag/v1.36.0%2Bk3s1>
- k3d release: <https://github.com/k3d-io/k3d/releases>
- MetalBear Kubernetes 1.36 정리: <https://metalbear.com/blog/kubernetes-1-36/>
