# 실습 환경 구축 및 정리 (Setup)

이 핸즈온은 AWS 리소스(EC2 `t4g.small` 1대, IAM role 및 instance profile, security group, SSM association, resource data sync, S3 버킷)를 사용합니다. EC2 인스턴스가 실행되는 동안 비용이 발생하므로 실습을 마치면 반드시 정리(Down) 절차를 실행합니다. ECS와 Lambda 리소스는 생성하지 않습니다.

## 사전 요구사항

- Terraform 1.11 이상
- AWS CLI v2 및 `ap-northeast-2` 리전에 리소스를 생성할 수 있는 자격 증명
- `uv` (Python 스크립트 실행)
- `jq`

## 환경 구축 (Up)

모든 명령은 저장소 루트에서 `aws/ssm/inventory` 디렉터리로 이동해 실행합니다. AWS CLI는 프로파일의 기본 리전을 따르므로, Terraform 및 Python 스크립트와 동일한 서울 리전(`ap-northeast-2`)으로 고정합니다.

```bash
cd aws/ssm/inventory
export AWS_REGION=ap-northeast-2
```

Terraform을 초기화하고 실습 인프라를 배포합니다.

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply
```

- EC2 인스턴스가 기동된 뒤 SSM managed node로 등록되기까지 약 1~3분이 소요됩니다.
- State Manager association(`AWS-GatherSoftwareInventory`)은 생성 직후 1회 실행되며, 이후 30분 주기로 반복 실행됩니다.

## 환경 정리 (Down)

`AWS_REGION=ap-northeast-2`가 설정된 셸에서 실행합니다. 실습 중 `PutInventory`나 파일 방식으로 생성한 custom inventory 타입은 Terraform state 밖에서 만들어진 리소스이므로, `terraform destroy` 전에 먼저 삭제해야 합니다.

custom inventory 타입(`Custom:AppDeployment`, `Custom:RackLocation`, `Custom:Probe`)을 삭제한 뒤 Terraform 리소스를 일괄 제거합니다.

```bash
for t in Custom:AppDeployment Custom:RackLocation Custom:Probe; do
  aws ssm delete-inventory --type-name "$t" --schema-delete-option DeleteSchema || echo "skip $t"
done
terraform -chdir=terraform destroy
```

- EC2 인스턴스가 종료되더라도 이미 수집된 Inventory 데이터는 마지막 갱신 시점으로부터 30일간 보관됩니다.
- S3 버킷은 `force_destroy = true`로 설정되어 있어 동기화된 객체와 함께 삭제됩니다.
