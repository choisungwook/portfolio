## 개요
* kubernetes API 서버는 정상이고 worker node가 not ready일 때 어떤 현상이 일어날까?

## 일어나는 현상
* worker node의 not not ready상태가 되면
  * worker node에 pod가 스케쥴링 되지 못하도록 taint가 설정된다.
  * pod-eviction-timeout(default: 5m)이상 지속되면, node에 실행 중인 pod가 eviction 된다.
  * 다른 정상 노드에 pod가 스케쥴링되고 endpoint가 업데이트 된다.
  * 하지만, node not ready에는 여전히 pod가 실행된다.

## 실습환경

* [kind cluster 1.30](./install_kind_cluster.md)

## 실습

1. httpbin deployment 배포

```sh
kubectl apply -f ./manifests/httpbin
```

2. httpbin 배포 확인

```sh
$ kubectl get pod,svc
NAME                           READY   STATUS    RESTARTS   AGE
pod/httpbin-7cc7c58d4d-v76nc   0/1     Running   0          31s

NAME                 TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
service/httpbin      NodePort    10.96.47.185   <none>        80:30090/TCP   31s
service/kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP        4m52s
```

```sh
$ curl 127.0.0.1:30090/status/200 -v
*   Trying 127.0.0.1:30090...
* Connected to 127.0.0.1 (127.0.0.1) port 30090
> GET /status/200 HTTP/1.1
> Host: 127.0.0.1:30090
> User-Agent: curl/8.7.1
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 200 OK
```

3.

```sh
docker network disconnect kind pod-eviction-timeout-worker
```

4.

```sh
docker exec -it pod-eviction-timeout-worker /bin/bash
```


5. node not ready taint 확인


```sh
$ kubectl describe node pod-eviction-timeout-worker | grep -i "Taints:" -A 4
Taints:             node.kubernetes.io/unreachable:NoExecute
                    node.kubernetes.io/unreachable:NoSchedule
```


```sh
mv /var/lib/kubelet/pki/kubelet.crt /var/lib/kubelet/pki/kubelet.crt.bak
mv /var/lib/kubelet/pki/kubelet.key /var/lib/kubelet/pki/kubelet.key.bak
openssl req -x509 -newkey rsa:4096 -keyout /var/lib/kubelet/pki/kubelet.key -out /var/lib/kubelet/pki/kubelet.crt -days 365 -nodes -subj "/CN=invalid"
systemctl restart kubelet
```

```sh
mv /var/lib/kubelet/pki/kubelet-client-current.pem /var/lib/kubelet/pki/kubelet-client-current.pem.bak
mv /var/lib/kubelet/pki/kubelet-server-current.pem /var/lib/kubelet/pki/kubelet-server-current.pem.bak

```

# 참고자료
* https://github.com/kubernetes/kubernetes/issues/55713
