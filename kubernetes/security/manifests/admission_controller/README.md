# 개요
* admission controller을 사용하여 initContainer을 생성하는 공격
* 공격자는 admission controller을 이용해서 얼마든지 쿠버제티스 요청을 변조시킬 수 있음
* admission controller 소스코드: https://github.com/choisungwook/admission_controller_practice

# 준비

* ca.crt 생성

```sh
make create-key
```

# admission controller pod 생성

* secret 생성

```sh
kubectl create secret tls webhook-certs --cert=certs/ca.crt --key=certs/ca.key --namespace=default
```

* admission controller pod 생성

```sh
kubectl apply -f ./admission-controller-deployment.yaml
```

* mutate webhook 생성

```sh
kubectl apply -f ./mutate-webhook.yaml
```

# nginx pod 생성

* nginx pod 생성

```sh
kubectl apply -f nginx_deployment.yaml
```

* nginx pod 상태 확인. `정상상태처럼 보이지만 악성 컨테이너가 같이 생성되고 종료됨`

```sh
$ kubectl get pod
NAME                                    READY   STATUS             RESTARTS   AGE
admission-controller-86c7bdd899-wb5k8   1/1     Running            0          4m11s
nginx-7ddd88dbc-gh98w                   1/1     Running            0          2m46s
```

* nginx pod에서 admission controlLer가 생성한 initContainer확인

```sh
$ kubectl get pod -oyaml
initContainers:
  - image: busybox
    name: busybox-by-mutatehandler
```

* 공격자는 admission controller을 이용해서 얼마든지 쿠버제티스 요청을 변조시킬 수 있음

# 실습환경 정리

```sh
make clean
```
