# managed cilium 환경에서 egress whitelist 적용

cilium을 사용하는 쿠버네티스에서 egress를 제한한다면, whitelist egress 방법을 추천합니다. 실제로 적용하면서 겪은 내용을 주제별 예제로 나눠 정리했습니다.

## whitelist egress 적용 방법

### 클러스터 정책

CiliumClusterwideNetworkPolicy를 사용하여 모든 namespace에 networkpolicy를 설정할 수 있습니다.

1. 쿠버네티스에서 실행중인 프로젝트가 멀티 테넌트 환경이 아니라면, 클러스터 내부 통신을 전부 허용합니다. cilium에서는 미리 정의된 대상 카테고리를 alias로 제공하는데 이를 엔티티라고 하는데 엔티티를 사용하여 ciliumnetworkpolicy를 쉽게 생성할 수 있습니다.

- 설정방법: [clusterwide-allow-cluster-entity.yaml](./entity-wide-allow/manifests/clusterwide-allow-cluster-entity.yaml)

1. kube-dns가 외부 DNS질의하는 것을 허용합니다. nodelocal dns를 사용하고 있다면, nodelocal dns도 host라는 엔티티로 허용합니다. rule.dns.matchPattern을 꼭 설정해야 합니다.

- 설정방법: [clusterwide-allow-dns.yaml](./entity-wide-allow/manifests/clusterwide-allow-dns.yaml)

## namespace별 정책

1. namespace별로 필요한 IP, 도메인 설정을 합니다.

- 설정방법: [app-allow-fqdn.yaml](./allow_ip_and_fqdn/manifests/app-allow-fqdn.yaml)

## Troubleshooting

- cilium daemonset agent pod에서 policy를 조회
- 조회가 된다면 egress를 허용한다는 뜻

```bash
cilium-dbg policy get | grep example.com
```
