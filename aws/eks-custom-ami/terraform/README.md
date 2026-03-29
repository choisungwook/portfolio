# EKS Custom AMI Terraform

## 개요

Packer로 빌드한 커스텀 EKS AMI를 사용하여 EKS 1.35 클러스터를 배포하는 Terraform 구성입니다.

## 사전 요구사항

- Terraform >= 1.11
- AWS CLI 설정 완료
- Packer로 빌드한 커스텀 AMI가 있어야 합니다

## 배포

환경변수를 설정합니다.

```sh
export TF_VAR_assume_role_arn="arn:aws:iam::XXXXXXXXXXXX:role/your-role"
export TF_VAR_custom_ami_id="ami-xxxx"
```

Terraform을 초기화하고 배포합니다.

```sh
terraform init
terraform plan
terraform apply
```

## 노드 조인 확인

kubeconfig를 업데이트합니다.

```sh
aws eks update-kubeconfig --name eks-custom-ami-1-35 --region ap-northeast-2
```

노드가 정상적으로 조인되었는지 확인합니다.

```sh
kubectl get nodes
```

## 정리

```sh
terraform destroy
```
