## 개요
* 쿠버네티스가 node 헬스체크하는 방법을 실습
* 블로그 설명: https://malwareanalysis.tistory.com/799

## 실습환경

* [kind cluster 1.30](./install_kind_cluster.md)

## 실습

1. worker node의 kubelet에서 헬스체크(lease API) 확인
* 10초마다 lease API를 호출

```sh
$ docker exec demo-worker journalctl -u kubelet | grep kube-node-lease/leases | grep PUT
Jan 18 13:08:36 demo-worker kubelet[228]: I0118 13:08:36.153975     228 round_trippers.go:553] PUT https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s 200 OK in 6 milliseconds
Jan 18 13:08:46 demo-worker kubelet[228]: I0118 13:08:46.299222     228 round_trippers.go:553] PUT https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s 200 OK in 5 milliseconds
Jan 18 13:08:56 demo-worker kubelet[228]: I0118 13:08:56.674712     228 round_trippers.go:553] PUT https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s 200 OK in 10 milliseconds
Jan 18 13:09:06 demo-worker kubelet[228]: I0118 13:09:06.792768     228 round_trippers.go:553] PUT https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s 200 OK in 6 milliseconds
```

2. kube API server가 업데이트한 헬스체크 설정 확인
* 10초마다 헬스체크 설정이 갱신됨

```sh
$ kubectl describe leases -n kube-node-lease demo-worker | grep Renew
  Renew Time:              2025-01-18T13:19:40.076516Z
```

3. 강제로 worker node not ready상태로 설정
* network를 단절시켜 kubelet -> kube API server 통신을 불가능하게 만듬

```sh
docker network disconnect kind demo-worker
```

4. lease API 호출 실패 확인

```sh
$ docker exec demo-worker journalctl -u kubelet | grep kube-node-lease/leases
Jan 18 13:30:26 demo-worker kubelet[228]: E0118 13:30:26.833170     228 controller.go:145] "Failed to ensure lease exists, will retry" err="Get \"https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s\": dial tcp: lookup demo-control-plane on 192.168.65.254:53: dial udp 192.168.65.254:53: connect: network is unreachable" interval="7s"
Jan 18 13:30:33 demo-worker kubelet[228]: I0118 13:30:33.836047     228 round_trippers.go:553] GET https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s  in 0 milliseconds
Jan 18 13:30:33 demo-worker kubelet[228]: E0118 13:30:33.836212     228 controller.go:145] "Failed to ensure lease exists, will retry" err="Get \"https://demo-control-plane:6443/apis/coordination.k8s.io/v1/namespaces/kube-node-lease/leases/demo-worker?timeout=10s\": dial tcp: lookup demo-control-plane on 192.168.65.254:53: dial udp 192.168.65.254:53: connect: network is unreachable" interval="7s"
```

5. node 상태 확인

```sh
$ kubectl get node
NAME                 STATUS     ROLES           AGE   VERSION
demo-control-plane   Ready      control-plane   25m   v1.30.4
demo-worker          NotReady   <none>          25m   v1.30.4
```

6. worker node는 Unknown status를 갖음

```sh
kubectl get node demo-worker -oyaml
  - lastHeartbeatTime: "2025-01-18T13:27:38Z"
    lastTransitionTime: "2025-01-18T13:29:21Z"
    message: Kubelet stopped posting node status.
    reason: NodeStatusUnknown
    status: Unknown
    type: Ready
```

7. controller manager 로그 확인

```sh
$ kubectl -n kube-system logs -f -l component=kube-controller-manager | grep "demo-worker"
I0118 13:42:19.596118       1 node_lifecycle_controller.go:958] "Node hasn't been updated" logger="node-lifecycle-controller" node="demo-worker" duration="1m40.067341504s" nodeConditionType="Ready" currentCondition="&NodeCondition{Type:Ready,Status:Unknown,LastHeartbeatTime:2025-01-18 13:40:29 +0000 UTC,LastTransitionTime:2025-01-18 13:41:19 +0000 UTC,Reason:NodeStatusUnknown,Message:Kubelet stopped posting node status.,}"
I0118 13:42:19.596269       1 node_lifecycle_controller.go:958] "Node hasn't been updated" logger="node-lifecycle-controller" node="demo-worker" duration="1m40.067514545s" nodeConditionType="MemoryPressure" currentCondition="&NodeCondition{Type:MemoryPressure,Status:Unknown,LastHeartbeatTime:2025-01-18 13:40:29 +0000 UTC,LastTransitionTime:2025-01-18 13:41:19 +0000 UTC,Reason:NodeStatusUnknown,Message:Kubelet stopped posting node status.,}"
```
