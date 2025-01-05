## 개요
* EKS 생성
* 아래 EKS는 저의 테스트 환경이므로, 본인이 원하는 자유롭게 EKS를 생성하시면 됩니다.

## EKS 생성 방법

1. EKS 관리 IAM role을 테라폼 변수로 설정

```bash
# AWS profile
export TF_VAR_assume_role_arn=""
```

2. 테라폼 코드 실행
```bash
terraform init
terraform plan
terraform apply # 약 15~20분 소요
````

3. kubeconfig 생성

```bash
# kubeconfig 생성
aws eks update-kubeconfig --region ap-northeast-2 --name karpenter-demo

# cluster 확인
kubectl cluster-info
```

## EKS 삭제 방법

```bash
terrform destroy
```
