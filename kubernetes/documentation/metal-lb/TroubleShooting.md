# 개요
* TroubleShooting 기록

# secret memberlist not found
* 상황: metal-lb 설치 시 secret 리소스 못찾는 에러
* 해결: secret 리소스 생성
```sh
kubectl create secret generic -n metallb-system memberlist --from-literal=secretkey="$(openssl rand -base64 128)"

```

![](imgs/memberlist%20not%20found.png)