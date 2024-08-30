# 개요
* AWS DMS 연습을 위한 EKS

# 테라폼 설치 방법

* assume role을 환경변수 설정

```sh
export TF_VAR_assume_role_arn=""
```

* 테라폼 코드 실행

```sh
terraform init
terraform plan
terraform apply # 약 15~20분 소요
```

* kubeconfig 업데이트는 아래 명령어를 사용

```sh
aws eks update-kubeconfig --region ap-northeast-2 --name aws-dms-demo
```

# EKS 삭제 방법

```sh
terraform destroy
```
