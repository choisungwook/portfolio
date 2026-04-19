# pod /etc/resolv.conf에 169.254.20.10을 누가 적었는가

## 의문이 시작된 지점

저는 [iptables 버전](../../iptables/docs/pod-resolv-conf.md)을 먼저 만들면서, "pod의 `/etc/resolv.conf`는 nodelocaldns 설치와 무관하게 그대로 kube-dns ClusterIP를 가리킨다"는 결론을 직접 확인한 적이 있습니다. 그러면 cilium 환경에서 같은 실험을 하면 결과가 같을까요?

이번 핸즈온은 일부러 다르게 잡았습니다. kind 설정에서 kubelet의 `clusterDNS`를 `169.254.20.10`으로 박았기 때문에, 결과가 정반대로 나옵니다. 그럼 이 IP를 실제로 pod resolv.conf에 적어 넣는 주체는 누구일까요? nodelocaldns 자체일까요, mutating webhook일까요, 아니면 kubelet일까요? 이번에도 직접 찍어보면서 답을 확인했습니다.

## 직접 확인

cilium만 설치하고 nodelocaldns는 아직 띄우지 않은 상태에서 새 pod를 띄워봤습니다.

```sh
kubectl run tmp --rm -it --restart=Never --image=busybox:1.36 -- cat /etc/resolv.conf
```

`nameserver 169.254.20.10`이 찍혔습니다. nodelocaldns는 아직 없는 상태인데도 그렇습니다. 그러니까 **nodelocaldns 설치가 이 파일을 바꾼 게 아닙니다.** pod가 만들어지는 시점에 이미 누군가가 이 IP를 적어넣고 있었다는 뜻입니다.

같은 pod에서 dig을 날려봤습니다.

```sh
kubectl run tmp --rm -it --restart=Never --image=nicolaka/netshoot:v0.13 -- dig +time=2 +tries=1 kubernetes.default.svc.cluster.local
```

타임아웃이 났습니다. resolv.conf는 169.254.20.10을 가리키는데 그 IP에서 응답할 daemon이 없으니 당연한 결과입니다. 핸즈온 본문의 "장애 재현" 시나리오와 같은 메커니즘입니다.

## 누가 적어넣었는가

답은 **kubelet**입니다. kubelet은 pod sandbox를 만들 때 `--cluster-dns` 플래그(또는 KubeletConfiguration의 `clusterDNS` 필드)에 들어 있는 값을 가져와서 pod의 `/etc/resolv.conf`에 적어줍니다. pod의 `dnsPolicy`가 기본값(`ClusterFirst`)이면 이 동작이 항상 일어납니다.

이번 클러스터에서는 kind config의 KubeletConfiguration 패치로 그 값을 잡아두었습니다. 노드(kind의 control-plane 컨테이너)에 들어가서 직접 확인해봤습니다.

```sh
docker exec localdns-cilium-control-plane cat /var/lib/kubelet/config.yaml
```

`clusterDNS:` 항목 아래에 `169.254.20.10`이 들어 있는 것을 확인할 수 있습니다. 이 파일이 바로 kubelet의 KubeletConfiguration이고, kind는 클러스터 생성 시점에 우리가 넘긴 패치를 이 파일에 합쳐 둡니다.

## 그 설정은 어디에서 왔는가

이번 핸즈온의 [kind-config.yaml](../kind-config.yaml)에 다음 내용이 들어 있습니다.

```yaml
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: KubeletConfiguration
        clusterDNS:
          - 169.254.20.10
```

`kubeadmConfigPatches` 안에 `KubeletConfiguration`을 끼워넣으면, kind는 클러스터를 부트스트랩할 때 그 내용을 노드의 kubelet config 파일에 합쳐줍니다. kind 자체가 kubeadm 위에서 도는 구조라서 가능한 트릭입니다. managed 환경(EKS, GKE 등)에서는 같은 효과를 내려면 클라우드 사업자가 제공하는 노드 설정 채널(예: launchTemplate user-data)을 통해 kubelet 플래그를 직접 주입해야 한다고 알고 있는데, 여기까지는 직접 검증해본 적이 없어 같이 적어둡니다.

kubelet 쪽 소스 코드까지 들어가보면, resolv.conf를 만드는 함수가 `pkg/kubelet/network/dns/dns.go`의 `Configurer.GetPodDNS`입니다. 코드 위치는 [kubernetes/kubernetes 마스터의 pkg/kubelet/network/dns/dns.go](https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/network/dns/dns.go)에서 볼 수 있습니다. `dnsPolicy`에 따라 분기하면서 ClusterFirst인 경우 `c.clusterDNS`를 nameserver로 채워주는 흐름이 그대로 보입니다. 이번 의문의 답이 이 함수 한 곳에 모여 있는 셈입니다.

## iptables 버전과의 대조

같은 nodelocaldns인데 환경에 따라 정반대 결론이 나옵니다.

- iptables 버전: kubelet은 기본값(kube-dns ClusterIP)을 그대로 둔다. pod resolv.conf는 변하지 않는다. 가로채기는 노드의 dummy interface와 iptables NOTRACK이 한다.
- cilium 버전(이 문서): kubelet에 `clusterDNS=169.254.20.10`을 박았으니 pod resolv.conf가 그 값으로 채워진다. 가로채기 트릭이 필요 없다.

저는 iptables 버전을 마치고 나서 "nodelocaldns의 핵심 설계는 노드 측에서 처리하는 것"이라고 이해했었는데, cilium 버전을 만들고 나서야 그 이해를 한 번 더 갱신했습니다. **nodelocaldns는 가로채기 메커니즘에 강한 가정을 하지 않습니다.** "169.254.20.10에서 listen할 테니, 어떤 식으로든 트래픽만 보내달라"가 nodelocaldns의 입장이고, 어떻게 보낼지는 환경(kube-proxy 모드, CNI, kubelet 설정)이 결정합니다.

## 운영 함의

이 결과가 핸즈온 본문의 "장애 재현" 시나리오와 그대로 연결됩니다. pod resolv.conf에 169.254.20.10이 박혀 있다는 말은, **fallback이 없다는 말**과 같습니다. nodelocaldns가 잠깐이라도 비면 그 노드의 모든 pod DNS가 함께 죽습니다. iptables 버전은 nodelocaldns가 죽으면 NOTRACK 규칙이 사라지면서 자연스럽게 kube-dns로 fallback이 되지만, cilium 버전은 그런 안전망이 없습니다.

그래서 이 구성을 운영할 때는 nodelocaldns의 **롤링 업데이트 전략**, **PodDisruptionBudget**, **시작 시 unavailable 시간 최소화** 같은 항목들이 단순한 nice-to-have가 아니라 가용성에 직접 묶인 문제가 됩니다. 저도 이 부분은 아직 운영해보지 않아서 더 공부할 영역입니다.

## 더 공부할 것

- KubeletConfiguration의 다른 DNS 관련 필드(`clusterDomain`, `resolvConf`)가 같이 쓰일 때의 상호작용. 특히 systemd-resolved 같은 호스트 DNS와 충돌하는 경우.
- `dnsPolicy: None` + `dnsConfig.nameservers`로 pod 단위 override를 거는 패턴. 클러스터 전체 kubelet 설정을 바꾸지 않고 같은 효과를 낼 수 있는지.
- CiliumLocalRedirectPolicy(LRP)로 만든 cilium-native 가로채기 방식. 이쪽은 pod resolv.conf를 건드리지 않으면서도 cilium socketLB 단계에서 DNS Service 호출을 nodelocaldns pod로 돌립니다. 이번 kubelet 방식과 trade-off가 어떻게 다른지.

## 참고자료

- kubelet의 resolv.conf 생성 코드: <https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/network/dns/dns.go>
- KubeletConfiguration 레퍼런스: <https://kubernetes.io/docs/reference/config-api/kubelet-config.v1beta1/>
- kind kubeadm patches: <https://kind.sigs.k8s.io/docs/user/configuration/#kubeadm-config-patches>
- 같은 레포의 [iptables 버전 디버깅 문서](../../iptables/docs/pod-resolv-conf.md)
- 핸즈온 본문: [../README.md](../README.md)
