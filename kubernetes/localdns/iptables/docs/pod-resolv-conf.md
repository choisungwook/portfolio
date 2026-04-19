# pod /etc/resolv.conf는 정말 바뀌지 않을까

## 의문이 시작된 지점

저는 nodelocaldns를 처음 공부했을 때, "그러면 pod 안의 `/etc/resolv.conf`가 nodelocaldns 설치 시점에 `169.254.20.10`으로 바뀌는 거구나"라고 막연히 생각했습니다. 그런데 막상 [README 핸즈온](../README.md)을 한 번 돌리고 나서도 이 부분이 명확하지 않았습니다. 누가 그 파일을 바꾸는 걸까요? kubelet일까요, mutating webhook일까요, 아니면 nodelocaldns pod가 다른 pod의 network namespace에 직접 손을 뻗는 걸까요?

## kind에서 직접 확인

저는 kind 클러스터를 띄우고, nodelocaldns를 설치하기 **전에** 먼저 테스트 pod의 `/etc/resolv.conf`를 찍어봤습니다.

```sh
kubectl apply -f manifests/test-pod.yaml
kubectl wait --for=condition=Ready pod/dns-test --timeout=60s
kubectl exec dns-test -- cat /etc/resolv.conf
```

여기서 보이는 `nameserver`는 kube-dns Service ClusterIP였습니다. 예를 들어 `nameserver 10.96.0.10` 같은 값이 찍힙니다. kind 환경이라 정확한 값은 클러스터마다 다를 수 있지만, 어쨌든 링크로컬 IP인 `169.254.20.10`은 어디에도 없었습니다.

이제 readme의 핸즈온 절차대로 nodelocaldns를 설치하고, **같은 pod**에서 다시 찍어봤습니다.

```sh
kubectl exec dns-test -- cat /etc/resolv.conf
```

결과는 동일했습니다. 여전히 `nameserver`는 kube-dns ClusterIP를 가리키고, `169.254.20.10`은 보이지 않았습니다. "혹시 pod를 새로 띄워야 반영되나?" 싶어서 새 pod에서도 확인해봤습니다.

```sh
kubectl run tmp --rm -it --image=busybox:1.36 -- cat /etc/resolv.conf
```

새 pod에서도 똑같았습니다. 결론은 명확했습니다. **pod의 `/etc/resolv.conf`는 nodelocaldns 설치와 무관하게 kube-dns ClusterIP를 가리킨다.** 제가 처음에 가졌던 가정이 틀렸던 셈입니다.

## 그럼 어떻게 169.254.20.10이 응답하는가

여기서 진짜 궁금증이 시작됐습니다. pod resolv.conf가 안 바뀌는데, readme 핸즈온의 tcpdump에서는 분명히 `169.254.20.10.53`이 찍혔습니다. 누가, 어디서 가로채는 걸까요?

저는 답을 찾으려고 노드(kind의 control-plane 컨테이너)에 들어가서 네트워크 인터페이스부터 봤습니다.

```sh
docker exec localdns-control-plane ip -4 addr show
```

여기에 `nodelocaldns`라는 이름의 dummy interface가 있고, `169.254.20.10/32`와 함께 **kube-dns의 ClusterIP**까지 같이 바인딩되어 있는 것을 발견했습니다. 두 IP가 한 dummy interface에 묶여 있는 게 핵심이었습니다. pod가 kube-dns ClusterIP로 보낸 패킷도, `169.254.20.10`으로 보낸 패킷도, 모두 노드의 host network namespace에서 로컬로 받아 처리되는 구조였습니다.

iptables도 확인해봤습니다.

```sh
docker exec localdns-control-plane iptables-save | grep 169.254.20.10
```

`raw/PREROUTING`과 `raw/OUTPUT`에 `NOTRACK` 규칙이, `filter/INPUT`과 `filter/OUTPUT`에는 보완용 `ACCEPT` 규칙이 들어와 있었습니다. NOTRACK이 필요한 이유는 conntrack을 우회해야 하기 때문입니다. 그렇지 않으면 kube-proxy가 만들어 둔 kube-dns ClusterIP에 대한 DNAT 규칙이 conntrack 매칭으로 다시 끼어들어 동작이 꼬입니다.

확인 차원에서 nodelocaldns DaemonSet을 지운 뒤 같은 두 명령을 다시 돌려봤습니다. dummy interface와 iptables 규칙이 깨끗하게 사라졌습니다. 그러니까 이 모든 설정은 **nodelocaldns pod가 살아 있는 동안에만 존재**한다는 사실까지 같이 확인됐습니다.

## 가로채기 로직은 nodelocaldns pod 안 어디에 있는가

이제 진짜 질문으로 돌아왔습니다. 그 dummy interface와 iptables 규칙은 누가 만드는가? 외부 컨트롤러가 아니라 **nodelocaldns pod 안의 `node-cache` 바이너리가 직접** 한다는 게 답이었습니다. 저는 [kubernetes/dns](https://github.com/kubernetes/dns) 저장소에서 v1.23.1 태그(이번 핸즈온에서 쓴 이미지 버전과 동일)를 따라 코드를 추적했습니다.

가장 먼저 본 곳은 플래그 파싱입니다. `-localip`로 받은 콤마 구분 IP들이 여기서 잘립니다. [`cmd/node-cache/main.go` L81-L100](https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/main.go#L81-L100)에서 그 처리를 확인할 수 있습니다. 공식 manifest는 `-localip`에 `__PILLAR__LOCAL__DNS__,__PILLAR__DNS__SERVER__`를 넘기므로, 링크로컬 IP와 kube-dns ClusterIP **두 개**가 같이 들어옵니다. 위에서 dummy interface에 두 IP가 동시에 보였던 이유가 이 한 줄에서 결정됩니다.

다음으로 dummy interface 자체를 만드는 코드를 봤습니다. 링크와 주소를 추가하는 함수가 [`pkg/netif/netif.go` L16-L61](https://github.com/kubernetes/dns/blob/1.23.1/pkg/netif/netif.go#L16-L61)에 있는데, `EnsureDummyDevice`로 link를 보장한 다음 `AddDummyDevice`가 `-localip`으로 받은 모든 IP를 `AddrAdd`로 한꺼번에 묶어줍니다. 이게 동작할 수 있는 이유는 DaemonSet이 `hostNetwork: true`이고, container에 `NET_ADMIN` capability가 붙어 있기 때문입니다. 두 조건 중 하나라도 빠지면 host의 network namespace를 건드릴 수 없습니다.

iptables 규칙은 별도 함수에서 만듭니다. `initIptables` 함수가 [`cmd/node-cache/app/cache_app.go` L110-L148](https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/app/cache_app.go#L110-L148)에 있고, 콤마로 받은 IP마다 NOTRACK과 ACCEPT 규칙을 한 세트씩 깔아줍니다. 그래서 kube-dns ClusterIP로 가는 트래픽도 링크로컬과 똑같은 처리를 받습니다.

마지막으로 흥미로웠던 부분은 **자가 치유 루프**입니다. nodelocaldns는 `runPeriodic` 고루틴을 돌면서 기본 60초마다 dummy interface와 iptables 규칙을 다시 점검하고 빠진 게 있으면 다시 채웁니다. 그 코드가 [`cmd/node-cache/app/cache_app.go` L205-L267](https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/app/cache_app.go#L205-L267)에 있습니다. kube-proxy가 재시작하면서 iptables를 새로 깔거나, 노드 운영자가 실수로 규칙을 지워버려도 60초 안에 복구됩니다. 처음 봤을 때 "꽤 신경 써서 만든 컴포넌트구나"라는 인상이 들었습니다.

## 한 줄 결론

저는 처음에 "pod resolv.conf가 바뀐다"고 잘못 알고 있었고, 이번에 그 가정을 깼습니다. **pod resolv.conf는 그대로 두고, 노드 측에서 dummy interface + iptables로 같은 IP 대역의 트래픽을 가로채는 구조**라는 게 nodelocaldns의 설계 핵심이었습니다. 이렇게 해두면 기존 pod를 재시작할 필요도, kubelet의 `--cluster-dns` 플래그를 바꿀 필요도, mutating webhook을 따로 둘 필요도 없습니다. 운영 관점에서 보면 영향 범위를 노드 안으로 깔끔하게 가둔 선택입니다.

## 더 공부할 것

- managed cilium 환경에서 `-localip` 인자가 어떻게 채워지는지. `kubeProxyReplacement=true`로 socketLB가 켜진 상태에서 dummy interface 트릭이 그대로 동작하는지, 아니면 다른 경로를 타는지.
- `dnsPolicy: None` + `dnsConfig.nameservers: ["169.254.20.10"]` 패턴. 이건 반대로 **pod resolv.conf 자체를 바꾸는** 접근인데, nodelocaldns의 dummy interface 트릭과 같이 쓰면 어떤 차이가 있는지.
- nodelocaldns의 `-syncinterval` 기본값(60초)이 운영 환경에서 충분한지. 더 짧게 잡으면 자가 치유는 빨라지지만 부하는 어떻게 변하는지.

## 참고자료

- nodelocaldns 소스 (k8s-dns-node-cache v1.23.1)
  - 플래그 파싱: <https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/main.go#L81-L100>
  - dummy interface 생성과 IP 바인딩: <https://github.com/kubernetes/dns/blob/1.23.1/pkg/netif/netif.go#L16-L61>
  - iptables 규칙 (`initIptables`): <https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/app/cache_app.go#L110-L148>
  - 주기적 재적용 (`runPeriodic`): <https://github.com/kubernetes/dns/blob/1.23.1/cmd/node-cache/app/cache_app.go#L205-L267>
- KEP-1024 NodeLocal DNSCache: <https://github.com/kubernetes/enhancements/tree/master/keps/sig-network/1024-nodelocal-cache-dns>
- 공식 문서: <https://kubernetes.io/docs/tasks/administer-cluster/nodelocaldns/>
