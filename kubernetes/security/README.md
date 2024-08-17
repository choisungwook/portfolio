# 개요
* 쿠버네티스 보안
* 블로그: https://malwareanalysis.tistory.com/756

# 목차
* [취약한 웹 DVWA 애플리케이션 manifests](./manifests/dvwa_webapp/)
* [secret을 탈취하는 시나리오](./attack1_steal_token.md)
* [pod를 생성하는 시나리오](./attack2_create_pod.md)
* [admission controller을 사용하여 공격](./attack3_admission_controller.md)
* [윈도우 쿠버네티스 원격 명령어 실행 취약점](./attack4_pv_vulnerability.md)
* [service externalIP를 사용하여 dns spoofing](./manifests/externalIP/)
* [etcd 암호화](./manifests/encryption_etcd/)
* [DNS poison](./attack5_dns_poison.md)

# 실습 환경 구축

* kind cluster 생성

```sh
kind create cluster --config kind-config.yaml
```

* nginx ingress controller 설치

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

* MetalLB 설치(LoadBalancer 사용)

```sh
$ kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/v0.14.8/config/manifests/metallb-native.yaml
$ docker network inspect -f '{{.IPAM.Config}}' kind
$ vi cm.yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: ip-pool
  namespace: metallb-system
spec:
  addresses:
  - 172.18.255.200-172.18.255.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: ip-pool
  namespace: metallb-system
spec:
  ipAddressPools:
  - ip-pool
```

* kind cluster 삭제

```sh
kind delete cluster --name security
```

# 참고자료
* kind cluster에서 metallb 설치방법: https://medium.com/groupon-eng/loadbalancer-services-using-kubernetes-in-docker-kind-694b4207575d
* kind cluster에서 metallb 설치방법: https://youtu.be/43fn499NYXs?si=kMBfzeIan6nhT2h7
