# Chapter 5 EKS Terraform

## TL;DR

- subnet을 만들지 않고 default VPC와 default subnet을 data source로 읽는다.
- EKS module은 `https://github.com/choisungwook/terraform_practice/releases/tag/v.1.35.5`를 사용한다.
- EKS 버전은 `1.35`다.
- managed node group은 CPU 1개와 Spot GPU 1개다.
- S3 Files file system, mount target, EFS CSI add-on, Pod Identity IAM role을 함께 만든다.
- S3 bucket은 S3 Files의 backend다. `data/chapter5`, `notebooks`는 공유 PVC로 읽고, 모델 저장 경로는 별도 access point와 `chapter5-model-assets-pvc`로 mount한다.
- S3 bucket 이름은 `${project_name}-artifacts-${random_id}` 형식이다. random endfix는 bucket 이름 충돌을 피하기 위해 Terraform `random_id`로 만든다.
- `terraform apply`는 이 문서 작업에서 실행하지 않는다.

## 준비

Terraform이 사용할 AWS profile을 먼저 준비한다.
필요하면 `terraform.tfvars`를 만든다.

```bash
cp eks/terraform/terraform.tfvars.example eks/terraform/terraform.tfvars
```

EKS를 생성하는 AssumeRole을 설정한다. `terraform.tfvars`에서 `assume_role_arn`을 채운다.

## 검증

Terraform apply 전 검증 명령이다.

```bash
terraform init
terraform validate
terraform plan
```

## 구성

| 파일 | 역할 |
|---|---|
| `data.tf` | default VPC, default subnet, caller identity 조회 |
| `eks.tf` | 사용자 EKS module 호출 |
| `iam.tf` | EBS CSI, EFS CSI, AWS Load Balancer Controller, S3 Files용 IAM role |
| `s3files.tf` | S3 bucket, S3 Files file system, 공유 access point, 모델 저장 access point, mount target, S3 object seed |
| `locals.tf` | managed node group, add-on, 파일 목록 |

## 확인 필요

- GPU Spot 용량은 AZ와 시점에 따라 부족할 수 있다.
- `AL2023_x86_64_NVIDIA` EKS optimized AMI는 NVIDIA driver와 container toolkit을 포함하지만 NVIDIA Kubernetes device plugin은 포함하지 않는다. `nvidia.com/gpu` resource를 쓰려면 Helm으로 device plugin을 설치한다.
- EKS add-on version은 `null`로 두어 AWS 기본 호환 버전을 사용한다. 특정 버전을 고정하려면 apply 전에 `aws eks describe-addon-versions`로 `1.35` 호환 버전을 확인한다.
- S3 Files는 S3 Versioning과 SSE-S3/SSE-KMS가 필요하다. 이 Terraform은 새 bucket에 Versioning과 AWS managed KMS key(`alias/aws/s3`) 기반 SSE-KMS를 설정한다.
- S3 Files access point의 POSIX UID/GID 기본값은 JupyterHub `jovyan` 사용자에 맞춘 `1000:1000`이다. 실제 singleuser UID/GID가 다르면 `s3files_access_point_uid`, `s3files_access_point_gid`도 같이 바꾼다.
- 모델 저장 access point는 기본적으로 `/model-assets-writable`을 root directory로 만든다. 기존 `/model-assets` 경로가 `root:root`로 생성되어 있을 수 있으므로, 새 경로를 사용해 root directory creation permissions를 적용한다.

## 참고자료

- Amazon EKS S3 Files CSI: https://docs.aws.amazon.com/eks/latest/userguide/s3files-csi.html
- EKS optimized accelerated AMIs: https://docs.aws.amazon.com/eks/latest/userguide/ml-eks-optimized-ami.html
- Manage NVIDIA GPU devices on Amazon EKS: https://docs.aws.amazon.com/eks/latest/userguide/device-management-nvidia.html
- S3 Files prerequisites: https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files-prereq-policies.html
- EFS CSI driver S3 Files support: https://github.com/kubernetes-sigs/aws-efs-csi-driver
- Terraform AWS provider: https://registry.terraform.io/providers/hashicorp/aws/latest
