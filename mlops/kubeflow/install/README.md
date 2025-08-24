# 개요

* kubeflow 설치 정리

## 전제조건

* 쿠버네티스가 설치되어 있어야 합니다. 저는 kind cluster를 사용했습니다.


## 설치방법

* 2025.8월 기준으로 kubeflow는 helm chart를 제공하지 않고 kustomize를 제공합니다.

1. git clone

```sh
git clone https://github.com/kubeflow/manifests.git kubeflow
cd kubeflow
```

2. kustomize build 결과 확인

```sh
kubectl kustomize  ./example > render.yaml
```

3. nginx ingress controller


* ingress controller 설치

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```


## 접속

* port-foward로 kubeflow 대시보드 접속
  * ID: user@example.com
  * PW: 12341234


```sh
kubectl port-forward svc/istio-ingressgateway -n istio-system 8888:80
kubectl get secret mlpipeline-minio-artifact -n kubeflow -o jsonpath='{.data.accesskey}' | base64 --decode;echo
kubectl get secret mlpipeline-minio-artifact -n kubeflow -o jsonpath='{.data.secretkey}' | base64 --decode;echo
```

* minio


```sh
kubectl port-forward -n kubeflow svc/minio-service 9000:9000
```

## 부록

### metrics server

```sh
helm repo add metrics-server https://kubernetes-sigs.github.io/metrics-server/
helm upgrade --install -f ./manifests/metrics-server/values.yaml -n kube-system metrics-server metrics-server/metrics-server
kubectl -n kube-system get pod -l app.kubernetes.io/instance=metrics-server
```



## 참고자료

* CNC의 kubeflow 설명: https://www.cncf.io/blog/2023/07/25/kubeflow-brings-mlops-to-the-cncf-incubator/
