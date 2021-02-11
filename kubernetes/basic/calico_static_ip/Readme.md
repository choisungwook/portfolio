# 1. 개요
* calico CNI를 사용하는 환경에서 pod IP를 정적으로 설정

<br>

# 2. static pod IP 설정 방법
* 새로운 IP Pool을 생성하여 적용
  * 단점: 다른 IP Pool pod와 통신 불가
* (권장) default IP Pool 범위 내에 IP 설정

<br>

# 3. 예제 실행
* 두 가지 예제
  * IP Pool를 생성해서 적용
  * default Pool IP 설정

## 3.1 IP Pool생성 예제
* 실행
```sh
kubectl apply -f IPPool.yaml
kubectl apply -f IPPool_nginx_deployment.yaml
```

* IPPool 확인
```
kubectl get ippool
```

## 3.2 Default IP Pool 확인
```sh
kubectl apply -f IPAddr_nginx_deployment.yaml
```

<br>

# 4. 상세설명

## 4.1 IP Pool생성 예제
### 4.1.1 calico IPPool 리소스 생성
* cidr에 static IP 설정
* yaml 예제
```yaml
apiVersion: crd.projectcalico.org/v1
kind: IPPool
metadata:
  name: new-pool1
spec:
  blockSize: 32
  cidr: 10.21.0.0/32
  ipipMode: Never
  natOutgoing: true
```

### 4.1.2 IPPool적용
* annotations 설정
  * "cni.projectcalico.org/ipv4pools": "[IP Pool 이름]"
* yaml 예제
  * pod는 new-pool1.spec.cidr에 설정된 IP 할당
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  selector:
    matchLabels:
      app: nginx
  replicas: 1
  template:
    metadata:
      labels:
        app: nginx
      annotations:
        "cni.projectcalico.org/ipv4pools": "[\"new-pool1\"]"
    spec:
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```

## 4.2 Default IP Pool 확인
### 4.2.1 default IP Pool CIDR 확인
```sh
kubectl describe ippool default-pool
```

![](imgs/default_ippool_cidr.png)

### 4.2.2 CIDR 범위에 존재하는 IP할당
* annotations cni.projectcalico.org/ipAddrs에 static IP 설정
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  selector:
    matchLabels:
      app: nginx
  replicas: 1
  template:
    metadata:
      labels:
        app: nginx
      annotations:
        "cni.projectcalico.org/ipAddrs": "[\"10.233.96.9\"]"
    spec:
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```

![](imgs/IPAddr_static_ip.png)

<br>

# 참고자료
* [1] [Calico 공식문서](https://docs.projectcalico.org/networking/use-specific-ip)
* [2] [Calio Git Issue](https://github.com/projectcalico/calico/issues/3251)
* [3] [IPAddr 예제](https://www.codenong.com/cs106048632/)