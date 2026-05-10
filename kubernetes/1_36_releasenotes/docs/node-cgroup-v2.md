# Kubernetes 1.36 node cgroup v2 정리

## 한 줄 결론

Kubernetes 1.36에서 cgroup v2 자체가 새로 추가된 것은 아니다. cgroup v2 support는 이미 stable이고, 1.36에서는 cgroup v2를 전제로 한 node 관측성과 memory 제어 기능이 더 중요해졌다.

## cgroup v2가 하는 일

cgroup은 Linux kernel이 process group별 CPU, memory, I/O 같은 resource 사용량을 제한하고 계측하는 기능이다. Kubernetes에서는 kubelet과 container runtime이 이 cgroup을 사용해서 pod/container의 request, limit, QoS, eviction 판단을 실제 kernel 제어로 연결한다.

cgroup v2는 기존 cgroup v1보다 더 일관된 단일 hierarchy를 사용한다. Kubernetes 관점에서 중요한 차이는 세 가지다.

- CPU, memory, I/O pressure를 PSI로 더 직접적으로 볼 수 있다.
- memory 제어에 `memory.min`, `memory.low`, `memory.high`, `memory.max` 같은 더 세밀한 primitive를 사용할 수 있다.
- runtime, monitoring agent, Java runtime처럼 cgroup filesystem을 직접 읽는 도구는 v2 호환성을 확인해야 한다.

node가 cgroup v2인지 확인한다.

```sh
stat -fc %T /sys/fs/cgroup/
```

기대 결과는 아래와 같다.

- cgroup v2: `cgroup2fs`
- cgroup v1: `tmpfs`

## 1.36에서 중요해진 항목

### Kubelet PSI metrics stable

PSI는 Pressure Stall Information의 약자다. CPU 사용률이 80%인지 90%인지보다 “process가 CPU, memory, I/O를 기다리느라 얼마나 멈췄는지”를 보여준다.

Kubernetes 1.36에서 `KubeletPSI`는 stable이고 feature gate가 true로 고정된다. 즉, 지원 조건을 만족하는 node에서는 kubelet이 PSI 정보를 node, pod, container 수준으로 수집한다.

PSI는 두 경로로 볼 수 있다.

- kubelet Summary API
- kubelet `/metrics/cadvisor` Prometheus metric

node 이름을 변수로 둔다.

```sh
NODE_NAME=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')
```

Summary API에서 PSI 값을 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/stats/summary" \
  | jq '.node.cpu.psi, .node.memory.psi, .node.io.psi'
```

Prometheus 형식 metric을 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/metrics/cadvisor" \
  | rg "container_pressure_(cpu|memory|io)_(waiting|stalled)_seconds_total" \
  | head
```

PSI 값은 `some`과 `full`로 나뉜다.

| 항목 | 의미 |
|---|---|
| `some` | 일부 task가 resource를 기다린 시간 |
| `full` | non-idle task 전체가 동시에 멈춘 시간 |
| `avg10`, `avg60`, `avg300` | 최근 10초, 60초, 5분 평균 pressure |
| `total` | 누적 stall time |

운영에서는 `some`이 계속 올라가면 병목 조짐으로 보고, `full`이 의미 있게 올라가면 workload가 실제로 진행하지 못하는 상황으로 본다.

### MemoryQoS with cgroups v2

MemoryQoS는 cgroup v2 memory controller를 사용해서 pod memory request/limit을 kernel의 memory 보호 정책에 더 가깝게 연결한다. Kubernetes 1.36에서도 feature gate는 alpha이고 기본값은 false다.

Kubernetes 1.36에서 바뀐 핵심은 `memoryReservationPolicy`다. feature gate를 켜면 `memory.high` 기반 throttling은 동작하지만, `memory.min`과 `memory.low` 예약은 별도 policy로 opt-in 한다.

| cgroup v2 파일 | 의미 | 1.36 MemoryQoS에서의 사용 |
|---|---|---|
| `memory.max` | hard memory limit | 기존 memory limit과 연결 |
| `memory.high` | memory throttling threshold | `memoryThrottlingFactor` 기반으로 계산 |
| `memory.min` | hard memory protection | `TieredReservation`에서 Guaranteed pod 보호 |
| `memory.low` | soft memory protection | `TieredReservation`에서 Burstable pod 보호 |

`TieredReservation`을 쓰면 QoS class별로 보호 강도가 달라진다.

| QoS class | 보호 방식 |
|---|---|
| Guaranteed | `requests.memory`를 `memory.min`으로 hard protection |
| Burstable | `requests.memory`를 `memory.low`로 soft protection |
| BestEffort | 별도 memory protection 없음 |

이전 방식처럼 Burstable pod request까지 모두 `memory.min`으로 강하게 잡으면 node memory 여유가 부족해질 수 있다. 1.36의 tiered 방식은 Guaranteed는 강하게 보호하고, Burstable은 평상시 보호하되 극단적인 memory pressure에서는 kernel이 회수할 수 있게 한다.

MemoryQoS를 tiered protection으로 켜는 kubelet 설정 예시는 아래와 같다.

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
featureGates:
  MemoryQoS: true
memoryReservationPolicy: TieredReservation
memoryThrottlingFactor: 0.9
```

기능을 켰는지 kubelet config를 확인한다.

```sh
kubectl get --raw "/api/v1/nodes/${NODE_NAME}/proxy/configz" \
  | jq '.kubeletconfig | {memoryReservationPolicy, memoryThrottlingFactor, featureGates}'
```

## 운영에서 확인할 것

### OS와 runtime 조건

cgroup v2 기반 기능은 Kubernetes version만 올린다고 자동으로 완성되지 않는다. node OS, kernel, container runtime, cgroup driver가 같이 맞아야 한다.

| 항목 | 확인 포인트 |
|---|---|
| cgroup version | node에서 `stat -fc %T /sys/fs/cgroup/` 결과가 `cgroup2fs`인지 확인 |
| kernel | cgroup v2는 5.8 이상, MemoryQoS `memory.high`는 5.9 이상 권장 |
| runtime | containerd 또는 CRI-O가 cgroup v2를 지원하는 version인지 확인 |
| cgroup driver | kubelet과 runtime이 systemd cgroup driver를 쓰는지 확인 |
| monitoring/security agent | cgroup filesystem 직접 읽는 agent가 cgroup v2를 지원하는지 확인 |

### cgroup v1 node

cgroup v1은 Kubernetes 1.35에서 deprecated 되었다. cgroup v1 node는 앞으로 더 위험한 upgrade surface가 된다. 1.36 release note를 볼 때는 “cgroup v2 feature가 추가됐다”보다 “cgroup v1에 남아 있으면 새 node 기능을 제대로 못 쓴다”에 가깝게 이해하는 편이 맞다.

### k3d 실습에서 볼 것

k3d node container 안에서 cgroup filesystem type을 확인한다.

```sh
K3D_SERVER_NODE=$(docker ps \
  --filter "label=app=k3d" \
  --filter "label=k3d.cluster=k8s-136" \
  --filter "label=k3d.role=server" \
  --format '{{.Names}}' \
  | head -n 1)

docker exec "${K3D_SERVER_NODE}" stat -fc %T /sys/fs/cgroup/
```

PSI kernel file이 있는지 확인한다.

```sh
docker exec "${K3D_SERVER_NODE}" sh -c 'cat /proc/pressure/cpu | head -n 1'
```

## 참고자료

- Kubernetes cgroup v2 공식 문서: <https://kubernetes.io/docs/concepts/architecture/cgroups/>
- Kubernetes PSI metrics 공식 문서: <https://kubernetes.io/docs/reference/instrumentation/understand-psi-metrics/>
- Kubernetes node metrics 공식 문서: <https://kubernetes.io/docs/reference/instrumentation/node-metrics/>
- Kubernetes feature gates 공식 문서: <https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/>
- Kubernetes v1.36 MemoryQoS 블로그: <https://kubernetes.io/blog/2026/04/29/kubernetes-v1-36-memory-qos-tiered-protection/>
- Kubernetes v1.36 release blog: <https://kubernetes.io/blog/2026/04/22/kubernetes-v1-36-release/>
