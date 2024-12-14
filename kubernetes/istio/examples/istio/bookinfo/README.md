## 개요
* istio 공식 예제 배포

## 실습환경
* [kind 클러스터](../../../install/kind_cluster/)
* istio v1.24

## 배포방법

1. default namespace에 istio injection 설정

```sh
kubectl label namespace default istio-injection=enabled
```

2. istio 공식 예제 배포

```sh
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.24/samples/bookinfo/platform/kube/bookinfo.yaml -n default
```

3. pod 조회

> istio가 sidecar 모드인 경우 READY가 2/2이어야 합니다.

```sh
$ kubectl get pod -n default
NAME                             READY   STATUS    RESTARTS   AGE
details-v1-79dfbd6fff-zn6kd      2/2     Running   0          2m28s
productpage-v1-dffc47f64-jcx6m   2/2     Running   0          2m28s
ratings-v1-65f797b499-zt5nl      2/2     Running   0          2m28s
reviews-v1-5c4d6d447c-gl529      2/2     Running   0          2m28s
reviews-v2-65cb66b45c-96kff      2/2     Running   0          2m28s
reviews-v3-f68f94645-kpspf       2/2     Running   0          2m28s
```


## 삭제방법

```sh
kubectl delete -f https://raw.githubusercontent.com/istio/istio/release-1.24/samples/bookinfo/platform/kube/bookinfo.yaml -n default
```

## 참고자료
* https://istio.io/latest/docs/examples/bookinfo/
