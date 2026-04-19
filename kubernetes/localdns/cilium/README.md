# NodeLocal DNSCache 핸즈온 (cilium 환경)

## 요약

- nodelocaldns를 적용할때 kubeproxy([iptables 버전](../iptables/README.md))가 있는 모드와 없는 모드의 차이가 있습니다. cilium처럼 kube-proxy를 쓰지 않는 구조라면, pod의 /etc/resolv.conf의 nameserver를 nodelocaldns ip인 169.254.20.10를 직접 명시해야 합니다.
- /etc/resolv.conf를 변경하는 것은 운영 리스크가 하나 생깁니다 — **nodelocaldns를 지우는 순간 클러스터 전체의 pod DNS가 즉시 죽습니다.** 핸즈온 마지막에 직접 그 장애를 재현해봅니다.

## 실습 환경

- cilium은 `1.18.5`를 사용합니다. 이 레포의 [cilium 설치 가이드](../../cilium/install/README.md)와 동일한 버전과 옵션 흐름을 따릅니다. 단, 이번에는 kubelet `clusterDNS`를 추가로 설정한 kind config를 씁니다.
- kind 클러스터를 만듭니다.
  - `disableDefaultCNI: true`, `kubeProxyMode: none`으로 cilium이 들어올 자리를 비워두고,
  - KubeletConfiguration 패치로 `clusterDNS`를 `169.254.20.10`으로 잡습니다.

```sh
kind create cluster --config kind-config.yaml
```

노드는 잠시 NotReady 상태로 보입니다. 그대로 cilium을 설치합니다. cilium이 올라오면 노드가 Ready로 바뀝니다.

```sh
cilium install --version 1.18.5 --set kubeProxyReplacement=true
cilium status --wait
```

## 핸즈온

1. 새 pod를 띄우면 `/etc/resolv.conf`가 어떻게 채워지는지 먼저 확인합니다. nodelocaldns를 아직 설치하지 않은 상태입니다.

```sh
kubectl apply -f manifests/test-pod.yaml
kubectl exec -it dns-test -- cat /etc/resolv.conf

```

`nameserver 169.254.20.10`이 찍힙니다. kubelet이 만든 결과입니다. 그러면 이 시점에 dig을 날리면 어떻게 될까요?

```sh
kubectl exec -it dns-test -- dig +time=2 +tries=1 kubernetes.default.svc.cluster.local
```

타임아웃이 납니다. 169.254.20.10에 아직 아무것도 listen하고 있지 않기 때문입니다. cilium 환경에서는 pod resolv.conf가 처음부터 nodelocaldns를 가리키므로 **nodelocaldns가 없으면 DNS도 없습니다.** 이 사실을 먼저 눈으로 보고 nodelocaldns를 설치합니다.

공식 nodelocaldns YAML을 받습니다. SA, ConfigMap, `kube-dns-upstream` Service, DaemonSet이 한 파일에 들어 있습니다.

```sh
wget https://github.com/kubernetes/kubernetes/raw/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml
```

placeholder 치환에 쓸 환경변수를 잡습니다.

```sh
kubedns=$(kubectl get svc -n kube-system kube-dns -o jsonpath='{.spec.clusterIP}')
domain=cluster.local
localdns=169.254.20.10
```

Linux에서는 GNU sed로 치환합니다.

```sh
sed -i "s/__PILLAR__LOCAL__DNS__/$localdns/g; s/__PILLAR__DNS__DOMAIN__/$domain/g; s/__PILLAR__DNS__SERVER__/$kubedns/g" nodelocaldns.yaml
```

macOS에서는 BSD sed라서 `-i` 다음에 빈 문자열 인자가 필요합니다.

```sh
sed -i '' "s|__PILLAR__LOCAL__DNS__|$localdns|g; s|__PILLAR__DNS__DOMAIN__|$domain|g; s|__PILLAR__DNS__SERVER__|$kubedns|g" nodelocaldns.yaml
```

치환된 YAML을 적용합니다.

```sh
kubectl apply -f nodelocaldns.yaml
kubectl -n kube-system rollout status ds/node-local-dns
```

## 확인

이제 같은 dig 쿼리가 정상적으로 응답을 받습니다.

```sh
kubectl exec dns-test -- dig +short kubernetes.default.svc.cluster.local
```

## 참고자료

- 공식 nodelocaldns 문서: <https://kubernetes.io/docs/tasks/administer-cluster/nodelocaldns/>
- 공식 nodelocaldns YAML: <https://github.com/kubernetes/kubernetes/blob/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml>
- cilium kubeProxyReplacement: <https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/>
- 같은 레포의 [cilium 설치 가이드](../../cilium/install/README.md)
- [iptables 버전 핸즈온](../iptables/README.md)
