- [1. 개요](#1-개요)
- [2. 목표](#2-목표)
- [3. 설치](#3-설치)
  - [3.1 쿠버네티스 리소스 설치](#31-쿠버네티스-리소스-설치)
  - [3.2 configmap 생성](#32-configmap-생성)
- [4. metalb-lb 실행 확인](#4-metalb-lb-실행-확인)
  - [4.1 nginx ingress 설치](#41-nginx-ingress-설치)
  - [4.2 서비스 external-ip 확인](#42-서비스-external-ip-확인)
  - [4.3 nginx 접속](#43-nginx-접속)
- [5. 참고자료](#5-참고자료)

<br>

# 1. 개요
* 온프레미스 환경에서 metal-lb 설치

<br>

# 2. 목표
* public cloud를 사용하지 않은 환경에서 loadbalacner service를 사용

<br>

# 3. 설치
## 3.1 쿠버네티스 리소스 설치
```sh
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.9.5/manifests/namespace.yaml
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.9.5/manifests/metallb.yaml
kubectl create secret generic -n metallb-system memberlist --from-literal=secretkey="$(openssl rand -base64 128)"
```

## 3.2 configmap 생성
* loadbalancer External IP 설정
  * configmap.yaml에서 addresses 필드 수정
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: metallb-system
  name: config
data:
  config: |
    address-pools:
    - name: default
      protocol: layer2
      addresses:
      - 192.168.219.58-192.168.219.59
```
* configmap 생성
```
kubectl apply -f configmap.yaml
```

<br>

# 4. metalb-lb 실행 확인
* nginx deployment, service 실행
  * service는 loadbalnacer 타입
```sh
kubectl apply -f demo-nginx.yaml
```

## 4.1 nginx ingress 설치
* 서비스 타입을 load-balancer로 설정됨

## 4.2 서비스 external-ip 확인
```
kubectl get svc my-nginx
```

![](imgs/get%20svc.png)

## 4.3 nginx 접속
* 확인한 external IP에 접속
![](img/../imgs/access%20nginx.png)

<br>

# 5. 참고자료
* [1] [metal-lb 설치 공식문서](https://metallb.universe.tf/installation/)

