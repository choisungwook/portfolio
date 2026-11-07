# 실습 환경 구축 및 리소스 정리

이 문서는 Aurora MySQL IAM DB 인증 핸즈온의 전체 시나리오를 수행하기 위한 기본 인프라를 배포하고 검증한 뒤, 실습 종료 후 안전하게 정리(Destroy)하는 절차를 안내합니다.

모든 시나리오(시나리오 1~6)는 여기서 구축하는 단일 환경을 공유합니다. `terraform apply` 한 번으로 "전통적인 비밀번호(Password) 기반으로 운영 중인 애플리케이션 및 트래픽 프로빙 환경"을 프로비저닝하며, 실습이 끝나면 `terraform destroy`를 통해 모든 자원을 일괄 삭제합니다.

## 실습 환경 아키텍처 및 프로비저닝 리소스

배포되는 주요 AWS 리소스와 각 구성 요소의 역할은 다음과 같습니다.

| 리소스 | 구성 사양 | 주요 역할 |
| --- | --- | --- |
| **Aurora MySQL** | `aurora-mysql` (실습 기준 `8.0.mysql_aurora.3.10.3`), Serverless v2 0.5~2 ACU (Writer 1대) | 핸즈온 대상 데이터베이스. 초기에는 IAM DB 인증이 비활성화된 상태로 기동 |
| **EC2 인스턴스** | `t4g.small` (Amazon Linux 2023), Default VPC (`ap-northeast-2a`) | `/api/items` 및 `/healthz` 엔드포인트를 서빙하는 Python HTTP 웹 애플리케이션 |
| **Lambda Prober** | Python 3.13, Default VPC 배치 (ENI 연결), 타임아웃 1분 | 1초 간격으로 EC2 API를 호출하고 성공·실패 지표를 CloudWatch EMF 메트릭으로 기록 |
| **EventBridge Scheduler** | `rate(1 minute)` | Lambda Prober를 매분 정기적으로 트리거하여 끊김 없는 클라이언트 트래픽 시뮬레이션 |
| **EC2 Application Status Check** | `GET :8080/healthz`, 검사 주기 60초 | 인스턴스 내부 웹 애플리케이션의 프로세스 정상 응답 여부를 EC2 시스템 상태 검사에 통합 |
| **SSM Parameter Store** | `/aurora-iam-lab/app-password` (SecureString), `/aurora-iam-lab/db-auth-mode` (String) | 애플리케이션 접속 비밀번호 및 무중단 전환 제어를 위한 동적 인증 모드 스위치 |
| **AWS Secrets Manager** | Aurora `manage_master_user_password` 연동 | 데이터베이스 마스터 계정(`admin`) 비밀번호 자동 생성 및 보관 (`aws/secretsmanager` 관리형 키 사용) |
| **CloudWatch Logs** | `audit`, `error`, `iam-db-auth-error`, Prober 로그 (보존 기간 1일) | 무중단 마이그레이션 검증 및 실패 원인 정밀 분석을 위한 로그 수집 |

### 네트워크 및 보안 그룹(Security Group) 제어 정책

최소 권한 원칙에 따라 인바운드 트래픽은 필요한 소스로만 엄격히 제한됩니다.

- **EC2 (8080 포트)**: 배포를 실행한 로컬 PC의 공인 IP (`/32`), Lambda Prober 전용 보안 그룹, Application Status Check 소스 보안 그룹만 허용합니다.
- **Aurora (3306 포트)**: 배포를 실행한 로컬 PC의 공인 IP (`/32`) 및 EC2 애플리케이션의 보안 그룹만 허용합니다.

로컬 PC의 공인 IP는 Terraform의 `data "http"`를 통해 `https://checkip.amazonaws.com`에서 자동으로 감지되어 `/32` CIDR로 주입됩니다. 기업 네트워크나 NAT 환경 등으로 별도의 IP 대역 접근이 필요한 경우 `variables.tf`의 `allowed_cidrs` 변수를 지정하여 덮어쓸 수 있습니다.

## 사전 요구사항

실습을 진행하기 위해 로컬 머신에 다음 도구들이 설치되어 있어야 합니다.

| 도구 | 최소 권장 버전 | 용도 |
| --- | --- | --- |
| **Terraform** | 1.11 이상 | `ephemeral` 리소스 및 Write-Only 인자(`value_wo`) 지원 필요 |
| **AWS CLI** | v2.36 이상 | 최신 `aws ec2 associate-application-status-check` 명령어 지원 필요 |
| **MySQL Client & jq** | 최신 버전 | DB 초기화 스크립트 실행 및 토큰 접속 테스트, JSON 응답 파싱 |
| **uv** | 최신 버전 | In-Place 전환 실험 스크립트(`inplace_alter_demo.py`)의 독립 가상환경 실행 |
| **AWS Session Manager Plugin** | 선택 사항 | 디버깅 목적으로 EC2 콘솔 셸에 접속할 때 사용 |

로컬 터미널에서 실습을 진행할 AWS 프로파일과 기본 리전을 환경 변수로 선언하고 작업 디렉터리로 이동합니다.

```bash
export AWS_PROFILE=<실습용 프로파일>
export AWS_REGION=ap-northeast-2
cd aws/rds/aurora-iam-auth
```

## 예상 소요 비용 분석

서울 리전(`ap-northeast-2`) 온디맨드 단가(2026년 11월 기준) 기준입니다. 약 1시간 동안 전체 핸즈온을 진행하고 즉시 삭제할 경우 약 $1 미만의 비용이 발생합니다.

| 항목 | 단가 기준 | 실습 중 소비 수준 |
| --- | --- | --- |
| **Aurora Serverless v2** | $0.20 / ACU-hour | 0.5~2 ACU 설정, 실습 중 약 $0.10 ~ $0.40/h |
| **EC2 (`t4g.small`)** | $0.0208 / hour | 약 $0.02/h |
| **Application Status Check** | 관리형 ENI당 $0.01 / hour | 약 $0.01/h |
| **퍼블릭 IPv4 주소** | $0.005 / hour | EC2 및 Aurora 2개 할당, 약 $0.01/h |
| **AWS Secrets Manager** | $0.40 / secret-month | 사용 시간에 비례한 일할 계산 (센트 단위 미만) |
| **SSM Parameter Store** | Standard 계층 무료 | $0 |
| **Lambda, Scheduler, CloudWatch Logs** | 사용량 기반 과금 | 매분 1회 실행 수준으로 Free Tier 범위 내 충족 |

동일 조건의 Provisioned 인스턴스 최저 사양인 `db.t4g.medium`($0.113/h) 대비 Serverless v2의 최소 사양(0.5 ACU, $0.10/h)을 활용하여 실습 비용을 최소화했습니다. 최대값을 2 ACU로 설정한 이유는 IAM DB 인증 처리가 내부적으로 300~1000 MiB 수준의 여유 메모리를 요구하므로 메모리 부족에 따른 연결 병목을 방지하기 위함입니다.

## Step 1. 인프라 배포

`terraform/` 디렉터리로 이동하여 인프라를 초기화하고 배포합니다. Aurora 클러스터 생성 과정으로 인해 전체 배포에는 약 10분이 소요됩니다.

Terraform 프로젝트를 초기화하고 리소스를 배포합니다.

```bash
cd terraform
terraform init
terraform apply
```

배포 완료 직전 `terraform_data.db_init` 프로비저너가 `scripts/db-init.sh`를 자동 호출하여 `labdb.items` 기본 테이블과 비밀번호 인증 기반 사용자 `app_pw`를 생성합니다.

배포 성공 시 터미널에 다음과 유사한 완료 메시지가 출력됩니다.

```text
terraform_data.db_init (local-exec): db-init done: labdb.items, user app_pw
Apply complete! Resources: 36 added, 0 changed, 0 destroyed.
```

## Step 2. 애플리케이션 정상 동작 확인

배포 완료 후 Terraform 출력값(`app_url`)을 조회하여 EC2 애플리케이션의 헬스체크 및 API 엔드포인트를 호출합니다. 인스턴스 초기 부팅 시 `uv` 기반 패키지 설치 및 서비스 등록 과정이 진행되므로 `apply` 직후 약 1~2분 정도 대기 시간이 필요할 수 있습니다.

애플리케이션 상태 검사(`/healthz`) 및 데이터 조회 API(`/api/items`)를 호출합니다.

```bash
APP_URL=$(terraform output -raw app_url)
curl -s $APP_URL/healthz
curl -s $APP_URL/api/items
```

정상적으로 초기화된 경우 다음과 같이 `mode: password` 및 `app_pw@%` 계정으로 연결된 JSON 응답이 반환됩니다.

```text
{"status": "ok"}
{"mode": "password", "db_user": "app_pw@%", "items": 3, "connect_ms": 9.7}
```

응답의 `db_user`가 `app_pw@%`로 확인되면 마이그레이션 실습을 위한 초기 상태 준비가 완료된 것입니다. 이후 시나리오는 이 상태를 기반으로 진행됩니다.

## Step 3. 시나리오별 Terraform 설정 변경 안내

실습 시나리오(시나리오 2 실습 1, 시나리오 4 등) 진행 중 Aurora 클러스터의 IAM DB 인증 옵션을 활성화해야 합니다. 이때는 Terraform 변수를 추가하여 재적용합니다.

IAM DB 인증 활성화 변수를 지정하고 설정을 갱신합니다.

```bash
echo 'iam_auth_enabled = true' > terraform.tfvars
terraform apply
```

이 변경을 통해 Aurora 클러스터의 `iam_database_authentication_enabled` 플래그가 활성화되고, EC2 IAM 인스턴스 프로파일에 `rds-db:connect` 허용 정책이 함께 연결됩니다.

> [!NOTE]
> Parameter Store에 저장된 인증 방식 스위치(`/aurora-iam-lab/db-auth-mode`)는 Terraform의 `lifecycle.ignore_changes`로 보호됩니다. 따라서 실습 중 AWS CLI로 값을 `iam` 또는 `password`로 변경하더라도 이후 `terraform apply` 실행 시 덮어써지지 않습니다.

## Step 4. 실습 환경 정리 (자원 삭제)

모든 실습이 완료되면 과금이 계속 발생하지 않도록 리소스를 완전히 삭제합니다.

프로비저닝된 인프라 리소스와 생성한 tfvars 파일을 제거합니다.

```bash
terraform destroy
rm -f terraform.tfvars
```

`terraform destroy` 과정은 약 20분 내외가 소요될 수 있습니다. 이는 Default VPC에 연결되었던 Lambda Prober의 관리형 ENI와 Application Status Check의 ENI가 AWS 내부적으로 안전하게 해제 및 회수되는 과정을 대기하기 때문입니다.

삭제 작업이 종료되면 AWS CLI로 잔여 리소스가 없는지 최종 확인합니다.

잔여 Aurora 클러스터, 상태 검사, CloudWatch 로그 그룹을 조회합니다.

```bash
aws rds describe-db-clusters --query "DBClusters[?DBClusterIdentifier=='aurora-iam-lab'].Status"
aws ec2 describe-application-status-checks --query 'ApplicationStatusChecks[].ApplicationStatusCheckId'
aws logs describe-log-groups --log-group-name-prefix /aws/rds/cluster/aurora-iam-lab --query 'logGroups[].logGroupName'
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/aurora-iam-lab --query 'logGroups[].logGroupName'
```

조회 결과가 모두 빈 배열(`[]`)이면 정리가 완료된 것입니다.

```text
[]
[]
[]
["/aws/lambda/aurora-iam-lab-prober"]
```

만약 상기 출력처럼 `/aws/lambda/aurora-iam-lab-prober` 로그 그룹이 남아 있다면, 이는 `terraform destroy` 실행 시점에 마지막으로 수행 중이던 Prober Lambda 함수가 로그를 남기면서 AWS Lambda 서비스에 의해 자동으로 재생성된 경우입니다. 아래 명령어로 해당 로그 그룹을 삭제합니다.

Lambda 잔여 로그 그룹을 수동으로 삭제합니다.

```bash
aws logs delete-log-group --log-group-name /aws/lambda/aurora-iam-lab-prober
```
