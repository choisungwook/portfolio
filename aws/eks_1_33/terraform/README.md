<!-- TOC -->

- [개요](#%EA%B0%9C%EC%9A%94)
- [준비](#%EC%A4%80%EB%B9%84)
- [EKS 생성방법](#eks-%EC%83%9D%EC%84%B1%EB%B0%A9%EB%B2%95)
- [kube context 생성](#kube-context-%EC%83%9D%EC%84%B1)
- [kubectl 실행](#kubectl-%EC%8B%A4%ED%96%89)
- [EKS 삭제 방법](#eks-%EC%82%AD%EC%A0%9C-%EB%B0%A9%EB%B2%95)

<!-- /TOC -->

## 개요

* 악분이 로컬에서 테스트용도로 사용하는 테라폼 EKS 모듈입니다. 테스트용도로만 사용하고 프로덕션에 사용하지 마세요.
* 프로덕션은 EKS Blueprint 등을 사용하시길 바랍니다.

## 준비

1. AWS IAM role 준비

* 제가 만든 모듈은 EKS를 생성하고 관리할 AWS IAM role이 필요합니다.
* AWS IAM role은 테라폼 변수 "assume_role_arn"로 관리합니다.
* assume_role_arn에 설정할 IAM role은 환경변수로 설정할 수 있습니다.

```bash
# AWS profile
export TF_VAR_assume_role_arn=""
```

2. EKS와 managed node group 배포

* [EKS](./terraform/)는 테라폼으로 구축했습니다. 테라폼 모듈은 저의 EKS 모듈을 사용했습니다. EKS blueprint 또는 편한 방법으로 EKS를 배포하시면 됩니다.

```sh
$ cat ./terraform/terraform.tfvars
managed_node_groups = {
  "managed-node-group-a" = {
    node_group_name = "managed-node-group-a",
    instance_types  = ["t3.medium"],
    capacity_type   = "ON_DEMAND",
    release_version = "1.33.0-20250519",
    disk_size       = 20,
    desired_size    = 2,
    max_size        = 2,
    min_size        = 2,
    labels = {
      "node-type" = "managed-node-group-a"
    }
  }
}
```

3. EKS addon 설정

* main.tf에 eks_addons 값을 설정합니다. EKS버전에 맞는 addons를 설정해야 합니다.
* EKS addons은 생성/수정/삭제 timeout이 5분으로 설정되어 있습니다.

> VPC CNI는 before_compute=true 옵션을 설정해주세요. VPC CNI는 노드 생성 후에 설치할 경우, hang이 걸릴 확률이 높습니다

```sh
$ cat main.tf
module "eks" {
  eks_addons = [
    ... 생략
  ]
```

4. EKs cluster 이름 설정

* terraform.tfvars의 eks_cluster_name에 EKS 이름을 설정합니다.
* eks_cluster_name 변수는 AWS VPC subnet 등 리소스 tag에 설정됩니다.

```sh
$ cat ./terraform/terraform.tfvars
eks_cluster_name = "eks-demo-1-33"
```

## EKS 생성방법

* 테라폼 apply

```sh
terraform init
terraform plan
terraform apply # 약 15~20분 소요
```

## kube context 생성

```sh
# kubeconfig 생성
EKS_NAME=eks-demo-1-33
aws eks update-kubeconfig --region ap-northeast-2 --name $EKS_NAME
```

## kubectl 실행

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

## EKS 삭제 방법

```bash
terrform destroy
```
