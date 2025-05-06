# 개요

* 악분이 로컬에서 테스트용도로 사용하는 테라폼 EKS 모듈입니다. 테스트용도로만 사용하고 프로덕션에 사용하지 마세요.
* 프로덕션은 EKS Blueprint 등을 사용하시길 바랍니다.

# 준비

## 1. AWS IAM role 준비

* 제가 만든 모듈은 EKS를 생성하고 관리할 AWS IAM role이 필요합니다.
* AWS IAM role은 테라폼 변수 "assume_role_arn"로 관리합니다.
* assume_role_arn에 설정할 IAM role은 환경변수로 설정할 수 있습니다.

```bash
# AWS profile
export TF_VAR_assume_role_arn=""
```

## 2. EKS 버전 설정

* terraform.tfvarfs에 eks_version 변수에 EKS 버전을 설정합니ㅏㄷ.

```sh
eks_version = 1.32
```

## 3. EKS addon 설정

* main.tf에 eks_addons 값을 설정합니다. EKS버전에 맞는 addons를 설정해야 합니다.
* EKS addons은 생성/수정/삭제 timeout이 5분으로 설정되어 있습니다.

> VPC CNI는 before_compute=true 옵션을 설정해주세요. VPC CNI는 노드 생성 후에 설치할 경우, hang이 걸릴 확률이 높습니다

```sh
eks_addons = [
  {
      name                 = "vpc-cni"
      version              = "v1.19.2-eksbuild.5"
      before_compute       = true
      configuration_values = jsonencode({})
    },
]
```

## 4. EKs cluster 이름 설정

* terraform.tfvars의 eks_cluster_name에 EKS 이름을 설정합니다.
8 eks_cluster_name 변수는 AWS VPC subnet 등 리소스 tag에 설정됩니다.

# EKS 생성방법

* 테라폼 apply

```bash
terraform init
terraform plan
terraform apply # 약 15~20분 소요
````

* kube context 생성

```bash
# kubeconfig 생성
EKS_NAME=eks-gpu
aws eks update-kubeconfig --region ap-northeast-2 --name $EKS_NAME
```

* kubectl 실행

```sh
# cluster 확인
export AWS_PROFILE={AWS IAM role이 있는 profile}
kubectl cluster-info
```

* AWS PROFILE은 아래처럼 설정되엉 있어야 합니다.

```sh
$ cat ~/.aws/config
[default]
region = ap-northeast-2
output = json

[profile eks]
region = ap-northeast-2
role_arn = {your iam role arn}
source_profile = default
```

# 삭제 방법

```bash
terrform destroy
```
