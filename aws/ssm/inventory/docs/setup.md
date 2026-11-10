# Setup

이 핸즈온은 AWS 리소스(EC2 t4g.small 1대, IAM role·instance profile, security group, SSM association, resource data sync, S3 버킷)를 사용합니다. EC2가 떠 있는 동안 비용이 나가므로 실습이 끝나면 Down을 실행합니다. ECS와 Lambda는 만들지 않습니다.

## 준비물

- Terraform 1.11 이상
- AWS CLI v2와 ap-northeast-2에 리소스를 만들 수 있는 자격 증명
- uv (Python 스크립트 실행)
- jq

## Up

명령은 workspace 루트에서 실행합니다.

```bash
cd aws/ssm/inventory
```

한 줄로 환경을 만듭니다.

```bash
terraform -chdir=terraform init && terraform -chdir=terraform apply
```

- EC2가 managed node로 등록되기까지 1~3분 걸림
- association은 생성 직후 1회 실행되고 이후 30분마다 실행됨

## Down

custom inventory 타입은 terraform 밖에서 만들었으므로 먼저 지우고, 그다음 리소스를 지웁니다.

```bash
for t in Custom:AppDeployment Custom:RackLocation Custom:Probe; do aws ssm delete-inventory --type-name "$t" --schema-delete-option DeleteSchema 2>/dev/null; done; terraform -chdir=terraform destroy
```

- 노드가 종료되어도 Inventory 데이터는 마지막 갱신 뒤 30일 동안 남음
- S3 버킷은 `force_destroy = true`라 객체와 함께 지워짐
