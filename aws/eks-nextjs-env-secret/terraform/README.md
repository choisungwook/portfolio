# Terraform

AWS Secrets Manager Secret과 External Secrets Operator가 읽을 IAM role을 만듭니다.

이 예제는 EKS 클러스터 자체를 만들지 않습니다. 이미 존재하는 EKS 클러스터의 OIDC provider ARN과 issuer URL을 입력받아 External Secrets Operator service account에 연결할 IAM role만 만듭니다.

## 사용 순서

민감값은 `terraform.tfvars`에 직접 커밋하지 않습니다. 아래 파일은 예시입니다.

```bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

`terraform apply` 후 `external_secrets_role_arn` 값을 External Secrets Operator service account annotation에 사용합니다.
