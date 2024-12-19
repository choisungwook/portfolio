# 개요
* 테라폼으로 EKS auto mode 생성

<br>

# 생성 방법

* 테라폼 변수를 환경변수로 설정

```bash
# AWS profile
export TF_VAR_assume_role_arn=""
```

* 테라폼 코드 실행
```bash
terraform init
terraform plan
terraform apply # 약 15~20분 소요
````

* kubeconfig 생성

```bash
# kubeconfig 생성
aws eks update-kubeconfig --region ap-northeast-2 --name "eks-automode"

# cluster 확인
kubectl cluster-info
```

<br>

# (옵션) Amazon prometheus를 사용하여 EKS 메트릭 수집

1. 테라폼 변수에서 enable_amp를 true로 설정
2. terraform apply(약 20분 소요)
3. [문서](./Amazon_prometheus.md)를 참고하여 grafana<->Amazon proemtheus 연동

# 삭제 방법

```bash
terrform destroy
```
