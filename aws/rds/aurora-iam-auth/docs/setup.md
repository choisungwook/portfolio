# 실습 환경 구축과 정리

모든 시나리오가 이 문서로 만든 환경 하나를 함께 씁니다. `terraform apply` 한 번으로 "password로 운영 중인 애플리케이션" 상태까지 만들고, 실습이 끝나면 `terraform destroy` 한 번으로 지웁니다.

## 만들어지는 것

| 리소스 | 설정 | 역할 |
| --- | --- | --- |
| Aurora MySQL | `aurora-mysql` default 버전(실습 시점 `8.0.mysql_aurora.3.10.3`), Serverless v2 0.5~2 ACU, writer 1대 | 조회 대상 DB. IAM DB 인증은 꺼진 상태로 시작 |
| EC2 | t4g.small, Amazon Linux 2023, default VPC의 `ap-northeast-2a` | `/api/items` API를 제공하는 애플리케이션 |
| Lambda prober | Python 3.13, default VPC, 1분 실행 | 1초 간격으로 API를 호출하고 성공·실패를 metric으로 남기는 클라이언트 |
| EventBridge Scheduler | `rate(1 minute)` | Lambda prober를 매분 실행 |
| EC2 application status check | `GET /healthz`, 60초 주기 | 애플리케이션 수준 상태를 EC2 상태 검사에 더함 |
| SSM Parameter Store | `/aurora-iam-lab/app-password`(SecureString, `alias/aws/ssm`), `/aurora-iam-lab/db-auth-mode`(String) | 앱 비밀번호와 인증 방식 스위치 |
| Secrets Manager | Aurora `manage_master_user_password` | master(`admin`) 비밀번호. 키는 `aws/secretsmanager` |
| CloudWatch Logs | `audit`, `error`, `iam-db-auth-error`, prober 로그, 보존 1일 | 마이그레이션 검증 근거 |

접근 제한은 security group이 맡습니다.

- EC2 8080 포트: apply한 PC의 공인 IP, Lambda prober의 security group, application status check의 source security group만 허용합니다.
- Aurora 3306 포트: apply한 PC의 공인 IP와 EC2의 security group만 허용합니다.

apply한 PC의 공인 IP는 Terraform이 `data "http"`로 `https://checkip.amazonaws.com`을 조회해 `/32`로 넣습니다. 다른 사람이 apply해도 그 사람의 IP로 제한되고, 회사 NAT처럼 여러 대역을 열어야 하면 `allowed_cidrs` 변수로 덮어씁니다.

## 사전 준비

| 도구 | 용도 |
| --- | --- |
| Terraform 1.11 이상 | `ephemeral` 리소스와 `value_wo`(write-only) 인자를 씁니다 |
| AWS CLI v2.36 이상 | `aws ec2 associate-application-status-check`가 포함된 버전 |
| `mysql` client, `jq` | DB 초기화 스크립트와 실습 명령 |
| `uv` | 마이그레이션 실험 스크립트 실행 |
| Session Manager plugin | 선택. EC2 셸에 들어갈 때만 필요합니다 |

모든 명령은 실습용 AWS 프로파일을 쓰는 셸에서 실행합니다.

```bash
export AWS_PROFILE=<실습용 프로파일>
export AWS_REGION=ap-northeast-2
cd aws/rds/aurora-iam-auth
```

## 비용

서울 리전 온디맨드 단가(2026-11 기준)입니다. 실습 전체(약 1시간)는 1달러 안쪽입니다.

| 항목 | 단가 | 실습 중 |
| --- | --- | --- |
| Aurora Serverless v2 | $0.20 / ACU-hour | 0.5~2 ACU, $0.10~0.40/h |
| EC2 t4g.small | $0.0208 / hour | $0.02/h |
| Application status check | managed ENI당 $0.01 / hour | $0.01/h |
| 공인 IPv4 | $0.005 / hour | EC2와 Aurora 2개, $0.01/h |
| Secrets Manager | $0.40 / secret-month | 사용 시간만큼 일할 |
| Parameter Store Standard | 무료 | 0 |
| Lambda, Scheduler, CloudWatch Logs | 사용량 과금 | 1분당 1회 실행, 무료 구간 안 |

같은 조건의 provisioned 최저 사양인 `db.t4g.medium`은 $0.113/h입니다. Serverless v2를 최소 0.5 ACU로 두면 $0.10/h라 이 실습에서는 가장 저렴합니다. 최대값을 2 ACU로 둔 이유는 IAM DB 인증이 300~1000 MiB의 여유 메모리를 요구하는데 0.5 ACU의 메모리는 약 1 GiB뿐이기 때문입니다.

## 1. 인프라 배포

Aurora 생성에 약 10분이 걸립니다.

```bash
cd terraform
terraform init
terraform apply
```

apply 마지막 단계에서 `terraform_data.db_init`이 `scripts/db-init.sh`를 실행해 `labdb.items` 테이블과 password 방식 사용자 `app_pw`를 만듭니다.

```text
terraform_data.db_init (local-exec): db-init done: labdb.items, user app_pw
Apply complete! Resources: 36 added, 0 changed, 0 destroyed.
```

## 2. 애플리케이션 동작 확인

`app_url` output으로 API를 호출합니다. EC2가 처음 부팅하며 `uv`로 Python과 의존성을 받으므로, apply 직후 1~2분은 응답이 없을 수 있습니다.

```bash
APP_URL=$(terraform output -raw app_url)
curl -s $APP_URL/healthz
curl -s $APP_URL/api/items
```

```text
{"status": "ok"}
{"mode": "password", "db_user": "app_pw@%", "items": 3, "connect_ms": 9.7}
```

`db_user`가 `app_pw@%`이면 마이그레이션 전 상태가 준비된 것입니다. 이후 시나리오는 이 상태에서 시작합니다.

## 3. 시나리오에서 바꾸는 Terraform 값

IAM DB 인증 활성화는 [시나리오 2](./2-iam-db-auth.md) 실습 1에서 합니다. 무중단 전환 절차에서 이 단계가 갖는 의미는 [시나리오 4](./4-zero-downtime-migration.md)에 있습니다. 아래 파일을 만들고 다시 apply합니다. 클러스터의 `iam_database_authentication_enabled`와 EC2 role의 `rds-db:connect` 권한이 함께 켜집니다.

```bash
echo 'iam_auth_enabled = true' > terraform.tfvars
terraform apply
```

인증 방식 스위치(`/aurora-iam-lab/db-auth-mode`)는 `lifecycle.ignore_changes`로 Terraform이 추적하지 않습니다. 실습 중 CLI로 바꾼 값이 다음 apply에서 되돌아가지 않습니다.

## 4. 실습 환경 삭제

실습 환경 전체와 시나리오에서 만든 tfvars를 지웁니다.

```bash
terraform destroy
rm -f terraform.tfvars
```

destroy는 실습에서 21분 30초 걸렸습니다. 대부분은 VPC에 붙은 Lambda의 ENI가 해제되기를 기다리는 시간입니다. Aurora log group은 Terraform이 미리 만들어 두었으므로 함께 지워집니다.

destroy가 끝나면 남은 리소스가 없는지 확인합니다.

```bash
aws rds describe-db-clusters --query "DBClusters[?DBClusterIdentifier=='aurora-iam-lab'].Status"
aws ec2 describe-application-status-checks --query 'ApplicationStatusChecks[].ApplicationStatusCheckId'
aws logs describe-log-groups --log-group-name-prefix /aws/rds/cluster/aurora-iam-lab --query 'logGroups[].logGroupName'
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/aurora-iam-lab --query 'logGroups[].logGroupName'
```

```text
[]
[]
[]
["/aws/lambda/aurora-iam-lab-prober"]
```

- Lambda log group이 다시 생겨 있을 수 있습니다. destroy 순간 실행 중이던 prober(최대 56초)가 Terraform이 log group을 지운 뒤에도 로그를 써서 Lambda가 log group을 새로 만들기 때문입니다. 남아 있으면 지웁니다.

```bash
aws logs delete-log-group --log-group-name /aws/lambda/aurora-iam-lab-prober
```
