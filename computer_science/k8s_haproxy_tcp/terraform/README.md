# EKS Terraform

TL;DR: Phase 8에서만 실행하는 EKS 핸즈온용 Terraform 코드다. 로컬 kind Phase 5~7 검증을 통과하기 전에는 비용이 발생하는 `apply`를 실행하지 않는다.

## 실행 순서

Terraform 초기화와 계획 확인은 다음 명령으로 실행한다.

```bash
terraform init
terraform plan -var-file=terraform.tfvars
```

EKS를 만들 때만 다음 명령을 실행한다.

```bash
terraform apply -var-file=terraform.tfvars
```

검증 종료 직후 리소스를 내린다.

```bash
terraform destroy -var-file=terraform.tfvars
```

## 출력값 사용

`terraform output`에서 `update_kubeconfig_command`와 `vpc_id`를 확인한 뒤 `manifests/envoy/envoy-service-eks.yaml`을 적용해 Envoy LoadBalancer Service와 NLB를 만든다. 단계별 절차는 [Envoy EKS 핸즈온](../docs/envoy-eks-hands-on.md)을 본다.
