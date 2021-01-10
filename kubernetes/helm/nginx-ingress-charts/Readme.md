# 개요
* ingress-controller 설치
* helm은 https://github.com/kubernetes/ingress-nginx/tree/master/charts/ingress-nginx 에서 가져왔습니다.

# values.yaml 내용
* service port: NodePort
```yaml
type: NodePort
nodePorts:
    http: 32080
    https: 32443
    tcp:
    8080: 32808
```

# 설치
* namespace는 ingress-controller 사용
* 실행시간이 약 30초 이상 소요
```sh
helm install ingress -n ingress-controller --create-namespace ./ingress-nginx
```

# 실행확인
```sh
export HTTP_NODE_PORT=32080
export HTTPS_NODE_PORT=32443
export NODE_IP=$(kubectl --namespace default get nodes -o jsonpath="{.items[0].status.addresses[1].address}")

echo "Visit http://$NODE_IP:$HTTP_NODE_PORT to access your application via HTTP."
echo "Visit https://$NODE_IP:$HTTPS_NODE_PORT to access your application via HTTPS."
```
