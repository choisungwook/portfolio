## 개요
* kind 클러스터에 istio 설치

## 전제조건
* docker가 설치되어 있어야 합니다.
* kind CLI가 설치되어 있어야 합니다.

## kind 클러스터 생성

1. kind 클러스터 생성

```sh
kind create cluster --config kind-config.yaml
```

2. kind 클러스터 생성 확인

```sh
$ kubectl get nodes
NAME                  STATUS   ROLES           AGE     VERSION
istio-control-plane   Ready    control-plane   3m51s   v1.31.4
istio-worker          Ready    <none>          3m40s   v1.31.4
istio-worker2         Ready    <none>          3m41s   v1.31.4
```

## istio 설치

1. istioctl 설치

```sh
brew install istioctl
```

2. istioctl version 확인

```sh
$ istioctl version
Istio is not present in the cluster: no running Istio pods in namespace "istio-system"
client version: 1.24.1
```

3. istio 설치: demo 프로파일 사용

```sh
istioctl install --set profile=demo --skip-confirmation
✔ Istio core installed ⛵️
✔ Istiod installed 🧠
✔ Egress gateways installed 🛫
✔ Ingress gateways installed 🛬
✔ Installation complete
```

![](./imgs/istio-profile.png)


4. istio 설치 확인

```sh
$ kubectl get pod -n istio-system
NAME                                    READY   STATUS    RESTARTS   AGE
istio-egressgateway-94bdb56cb-kxsq5     1/1     Running   0          99s
istio-ingressgateway-86cb558598-zbbv7   1/1     Running   0          99s
istiod-7dccd8956d-8xlzv                 1/1     Running   0          113s
```

## 참고자료
* https://istio.io/latest/docs/setup/platform-setup/kind/
* https://medium.com/@s4l1h/how-to-install-kind-and-istio-ingress-controller-3b510834c762
