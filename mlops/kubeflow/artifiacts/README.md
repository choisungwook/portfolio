## 개요

* artifact에 대해 설명

## artifact란?

* artifact는 pipeline실행 중에 생성된 산출물을 저장합니다. articat는 object stroage에 저장하고 클라우드가 아닌 환경은 minio 같은 오픈소스 object storage를 사용합니다.

## minio 대시보드 접속 방법

1. port-foward

```sh
kubectl port-forward -n kubeflow svc/minio-service 9000:9000
```

2.minio ID,Pssword 확인

```sh
kubectl get secret mlpipeline-minio-artifact -n kubeflow -o jsonpath='{.data.accesskey}' | base64 --decode;echo
kubectl get secret mlpipeline-minio-artifact -n kubeflow -o jsonpath='{.data.secretkey}' | base64 --decode;echo
```
