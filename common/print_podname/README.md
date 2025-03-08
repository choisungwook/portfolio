# 개요
* pod name을 조회하는 API
* python FasteAPI로 개발됨

# 배포 방법

```sh
kubectl apply -f ./manifests/
```

# 호출 예제

```sh
$ curl print-podname.default.svc.cluster.local; echo
{"pod_name":"print-podname-576985bbff-pvtsb"}netshoot-597b97c87f-9wlt6
```
