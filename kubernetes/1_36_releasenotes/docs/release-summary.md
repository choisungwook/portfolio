# Kubernetes 1.36 릴리즈 요약

## 릴리즈 규모

| 항목 | 값 |
|---|---|
| 릴리즈 | Kubernetes v1.36.0 Haru |
| 릴리즈 날짜 | 2026-04-22 |
| enhancements | 70개 |
| Stable 승격 | 18개 |
| Beta 진입 | 25개 |
| Alpha 진입 | 25개 |
| 1.36 patch release | 작성 기준 없음 |

## 기능 요약

| 상태 | 기능 | 의미 | 운영 판단 |
|---|---|---|---|
| Stable | MutatingAdmissionPolicy | CEL 기반 in-process mutation 정책 | 단순 label/field/default injection은 webhook보다 운영 부담이 줄어듦 |
| Stable | User Namespaces for pods | container root를 host 비권한 UID/GID로 mapping | multi-tenant와 breakout 방어에 유리하지만 runtime, volume, securityContext 호환성 확인 필요 |
| Stable | Fine-grained kubelet API authorization | kubelet API 권한을 `nodes/proxy`보다 세밀하게 제어 | monitoring agent 권한을 least privilege로 줄일 수 있음 |
| Stable | VolumeGroupSnapshot | 여러 PVC를 crash-consistent하게 snapshot | CSI driver와 snapshot controller 지원이 전제 |
| Stable | Mutable CSINode allocatable | CSI driver가 node별 volume attach limit을 동적으로 갱신 | volume attach limit이 바뀌는 환경에서 scheduling 실패를 줄임 |
| Stable | DRA prioritized alternatives | DRA device request에 우선순위 기반 fallback 가능 | GPU 모델 fallback 같은 AI/HPC scheduling에 유용 |
| Stable | PSI metrics on cgroup v2 | kubelet이 CPU/Memory/I/O stall time을 node/pod/container 수준으로 노출 | 단순 사용률보다 node contention 분석에 도움 |
| Alpha | MemoryQoS with cgroup v2 | `memory.high`, `memory.min`, `memory.low`로 pod QoS class별 memory 보호를 조정 | kernel, runtime, kubelet 설정이 맞는 node에서만 실험적으로 검토 |
| Beta | Resource health status | pod status에서 device health 확인 | GPU/가속기 장애 원인 추적에 도움 |
| Beta | Strict IP/CIDR validation | 잘못된 IP/CIDR 입력을 더 엄격하게 잡음 | 오래된 manifest에 비정상 값이 있으면 경고/실패 가능성 확인 |
| Beta | `.kuberc` | cluster config와 kubectl 사용자 preference 분리 | 개인 CLI 설정과 cluster 접근 설정을 분리 가능 |
| Beta | DRA device taints/tolerations | node taint처럼 device 상태를 scheduling에 반영 | 가속기 장애, 점검, 격리 운영에 유용 |
| Beta | Constrained Impersonation | impersonation 권한을 수행 가능 action과 함께 제한 | controller 권한 위임 리스크 감소 |
| Beta | `/statusz`, `/flagz` | component 상태와 실행 flag를 HTTP endpoint로 확인 | 장애 대응 때 control plane 설정 확인이 쉬워짐 |
| Alpha | HPA scale to zero | external/object metric 기반으로 replica 0까지 축소 | 비용 절감 가능성이 있지만 feature gate와 metric 설계가 필요 |
| Alpha | Manifest-based admission control config | admission policy를 API object가 아니라 static file에서 로드 | etcd 장애나 policy 삭제 공격에도 admission 보호 가능성 |
| Alpha | Native histogram metrics | kube-apiserver 등에서 sparse histogram 기반 metric 실험 | SLI/SLO 해상도 개선 가능성, metric backend 호환성 확인 필요 |

## 먼저 봐야 할 운영 영향

| 구분 | 변경 | 운영 영향 | 확인 방법 |
|---|---|---|---|
| ACTION REQUIRED | `volume_operation_total_errors` metric 이름이 `volume_operation_errors_total`로 변경 | Prometheus alert, Grafana dashboard, recording rule이 깨질 수 있음 | 모니터링 repo에서 기존 metric 검색 |
| ACTION REQUIRED | scheduler PreBind plugin 병렬 실행 인터페이스 변경 | custom scheduler plugin이 있으면 `PreBindPreFlightResult` 대응 필요 | 사내 scheduler plugin 코드 검색 |
| ACTION REQUIRED | DRA ResourceClaim status update RBAC 세분화 | DRA driver/controller가 403을 만날 수 있음 | DRA 사용 cluster의 ClusterRole 확인 |
| ACTION REQUIRED | kubeadm flex-volume 통합 지원 제거 | kubeadm이 더 이상 KCM static pod에 flex-volume 경로를 자동 mount하지 않음 | flex-volume 사용 여부 확인 |
| ACTION REQUIRED | `etcd_bookmark_counts` metric 이름이 `etcd_bookmark_total`로 변경 | etcd/API server 관련 alert와 dashboard 수정 필요 | 모니터링 repo에서 기존 metric 검색 |
| Deprecation | `Service.spec.externalIPs` deprecated | 외부 라우팅이 이미 node로 들어오는 IP를 Service backend로 보내던 기능이다. v1.36부터 경고가 나오고, 공식 블로그 기준 v1.43 제거 예정 | `kubectl get svc -A -o yaml`에서 `externalIPs` 검색 |
| Removed/Disabled | `gitRepo` volume plugin 비활성화, 다시 켤 수 없음 | `gitRepo` volume을 쓰는 pod가 더 이상 정상 동작하지 않음 | manifest에서 `gitRepo:` 검색 |
| Removed | in-tree Portworx volume plugin 제거 | Portworx in-tree 경로 의존 cluster는 CSI migration 상태 확인 필요 | PV/StorageClass provisioner 확인 |
| Removed | cAdvisor의 `container_cpu_load_average_10s`, `container_cpu_load_d_average_10s`, `cpu_tasks_state` metric 제거 | 사용 중인 dashboard panel이 빈 값이 될 수 있음 | Prometheus query 검색 |

## node cgroup v2 메모

cgroup v2 자체는 1.36 신규 기능이 아니다. Kubernetes cgroup v2 support는 이미 stable이고, cgroup v1은 1.35에서 deprecated 되었다. 1.36에서 눈에 띄는 변화는 cgroup v2를 전제로 한 node 관측성과 memory 제어가 더 중요해졌다는 점이다.

| 항목 | 1.36에서 볼 점 | 확인 명령 |
|---|---|---|
| cgroup v2 사용 여부 | node OS가 cgroup v2인지 확인 | `stat -fc %T /sys/fs/cgroup/` |
| Kubelet PSI | `KubeletPSI`가 stable이고 true로 고정 | `kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/stats/summary"` |
| PSI Prometheus metric | `/metrics/cadvisor`에서 pressure metric 확인 | `kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/metrics/cadvisor"` |
| MemoryQoS | alpha 기능이며 `memoryReservationPolicy`로 tiered protection opt-in | `kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/configz"` |

자세한 내용은 [node-cgroup-v2.md](./node-cgroup-v2.md)에 따로 정리했다.

## k3s v1.36.0+k3s1 메모

k3s도 Kubernetes v1.36.0 기반 release가 나왔다. GitHub release 기준 `v1.36.0+k3s1`은 2026-05-06에 공개되었고, Docker image tag는 `rancher/k3s:v1.36.0-k3s1`처럼 `+` 대신 `-`를 쓴다.

| k3s embedded component | version |
|---|---|
| Kubernetes | v1.36.0 |
| Kine | v0.14.16 |
| SQLite | 3.51.3 |
| Etcd | v3.6.7-k3s1 |
| Containerd | v2.2.3-k3s1 |
| Runc | v1.4.2 |
| Flannel | v0.28.4 |
| Metrics-server | v0.8.1 |
| Traefik | v3.6.13 |
| CoreDNS | v1.14.2 |
| Helm-controller | v0.17.1 |
| Local-path-provisioner | v0.0.35 |

## 참고자료

- Kubernetes v1.36 릴리즈 블로그: <https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/>
- Kubernetes v1.36 changelog: <https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/CHANGELOG-1.36.md#changelog-since-v1350>
- Kubernetes cgroup v2 공식 문서: <https://kubernetes.io/docs/concepts/architecture/cgroups/>
- Kubernetes PSI metrics 공식 문서: <https://kubernetes.io/docs/reference/instrumentation/understand-psi-metrics/>
- Kubernetes feature gates 공식 문서: <https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/>
- Kubernetes v1.36 MemoryQoS 블로그: <https://kubernetes.io/blog/2026/04/29/kubernetes-v1-36-memory-qos-tiered-protection/>
- k3s v1.36.0+k3s1 release: <https://github.com/k3s-io/k3s/releases/tag/v1.36.0%2Bk3s1>
- MetalBear Kubernetes 1.36 정리: <https://metalbear.com/blog/kubernetes-1-36/>
