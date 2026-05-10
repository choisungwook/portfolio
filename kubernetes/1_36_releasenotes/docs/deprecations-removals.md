# Kubernetes 1.36 deprecated와 removed 항목

## `Service.spec.externalIPs` deprecated

- v1.36부터 `Service.spec.externalIPs` 사용 시 deprecation warning이 나온다.
- 공식 블로그는 제거 예정 버전을 v1.43으로 설명한다.
- 이 필드는 CVE-2020-8554와 연결된 오래된 보안 리스크가 있다.
- 대안:
  - cloud 환경: `type: LoadBalancer`
  - 단순 노출: `NodePort`
  - 장기 구조: Gateway API

### `externalIPs`가 하던 일

`externalIPs`는 Service에 “이 외부 IP로 들어오는 트래픽도 이 Service로 보내라”라고 알려주는 필드다.

예를 들어 cluster 밖의 라우터나 L2 네트워크가 `198.51.100.32` 트래픽을 Kubernetes node 중 하나로 보내고 있다고 가정한다. Service에 아래처럼 `externalIPs`를 넣으면, node에 도착한 `198.51.100.32:80` 트래픽을 kube-proxy 규칙이 받아서 Service backend pod로 전달한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app.kubernetes.io/name: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
  externalIPs:
    - 198.51.100.32
```

중요한 점은 Kubernetes가 이 IP를 할당하거나 소유하지 않는다는 것이다. `externalIPs`는 IPAM도 아니고 LoadBalancer도 아니다. 외부 라우팅, ARP/NDP, BGP, 방화벽, NAT 같은 네트워크 준비는 cluster 관리자가 별도로 맞춰야 한다.

### 많이 쓰였던 경우

과거에는 managed LoadBalancer나 Gateway API가 없거나 부담스러운 환경에서 `externalIPs`를 간단한 노출 수단으로 사용했다.

- bare metal cluster에서 특정 물리 IP를 Service에 직접 붙이고 싶을 때
- 사내 L2/VLAN 환경에서 이미 라우팅되는 VIP를 Service로 받게 하고 싶을 때
- cloud provider LoadBalancer 비용이나 생성 시간을 피하고 싶을 때
- lab, PoC, 사내망 test cluster에서 “일단 이 IP로 접속되게” 만들고 싶을 때
- 외부 장비가 특정 고정 IP만 바라보는 구조에서 Kubernetes Service를 뒤에 붙일 때

이런 상황에서는 `externalIPs`가 단순하고 빠르다. 별도 controller가 없어도 Service spec만으로 kube-proxy가 트래픽 처리 규칙을 만들기 때문이다.

### 왜 문제가 되었나

문제는 `externalIPs`가 “이 IP를 누가 소유하고 있는지”를 Kubernetes가 검증하지 않는다는 데 있다.

권한이 있는 사용자가 Service를 만들 수 있다면, 자신이 실제로 소유하지 않은 외부 IP도 Service spec에 적을 수 있다. cluster 네트워크 조건에 따라 이 설정은 트래픽 가로채기나 우회 경로를 만들 수 있다. CVE-2020-8554가 이 위험을 지적했고, 1.36 deprecation은 이 오래된 설계를 정리하는 방향으로 보면 된다.

### 무엇으로 옮길까

운영 환경에서는 `externalIPs`를 새로 늘리지 않는 편이 낫다.

| 기존 사용 이유 | 대안 |
|---|---|
| cloud에서 외부 IP 노출 | `type: LoadBalancer` |
| bare metal에서 LoadBalancer IP 필요 | MetalLB, kube-vip, Cilium LB IPAM 같은 LoadBalancer 구현 |
| HTTP/HTTPS ingress routing | Gateway API 또는 provider ingress/gateway |
| 간단한 port 노출 | `NodePort` |
| 사내망 고정 VIP 유지 | 네트워크 팀이 소유한 LoadBalancer/Gateway 앞단으로 이전 |

## `gitRepo` volume plugin disabled

- `gitRepo` volume은 v1.11부터 deprecated였다.
- v1.36에서는 plugin이 기본 비활성화되고 다시 켤 수 없다.
- 대안:
  - init container에서 `git clone`
  - `git-sync` 같은 sidecar 또는 init 방식
  - image build 단계에서 필요한 파일 포함

## flex-volume kubeadm 통합 지원 제거

- kubeadm은 더 이상 flex-volume 경로를 kube-controller-manager static pod에 자동 mount하지 않는다.
- flex-volume 자체는 오래전부터 CSI migration이 권장되었다.
- 계속 써야 한다면 custom KCM image, `--flex-volume-plugin-dir`, kubeadm `extraVolumes`를 직접 관리해야 한다.

## metric rename과 제거

- `volume_operation_total_errors` -> `volume_operation_errors_total`
- `etcd_bookmark_counts` -> `etcd_bookmark_total`
- cAdvisor에서 `container_cpu_load_average_10s`, `container_cpu_load_d_average_10s`, `cpu_tasks_state` 제거

## 업그레이드 전 점검 명령

manifest에서 `externalIPs`와 `gitRepo`를 검색한다.

```sh
rg "externalIPs:|gitRepo:" .
```

flex-volume 흔적을 검색한다.

```sh
rg "flex-volume|flexVolume|flexvolume|--flex-volume-plugin-dir" .
```

metric rename 대상을 검색한다.

```sh
rg "volume_operation_total_errors|etcd_bookmark_counts|container_cpu_load_average_10s|container_cpu_load_d_average_10s|cpu_tasks_state" .
```

DRA를 쓰는 cluster라면 ResourceClaim 관련 RBAC를 확인한다.

```sh
kubectl get clusterrole -o yaml | rg "resourceclaims/(binding|driver)|resourceclaims"
```

## 참고자료

- Kubernetes v1.36 changelog: <https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG/CHANGELOG-1.36.md#changelog-since-v1350>
- External IPs 공식 문서: <https://kubernetes.io/docs/concepts/services-networking/service/#external-ips>
- KEP-5707 Deprecate service.spec.externalIPs: <https://kep.k8s.io/5707>
- KEP-5040 Remove gitRepo volume driver: <https://kep.k8s.io/5040>
