# 환경 구성

## 준비물

공통 도구입니다.

- AWS CLI v2
- uv

AgentCore 실습에는 다음 항목이 추가로 필요합니다.

- Docker와 Docker Compose
- Terraform 1.11 이상
- jq와 curl
- AgentCore Gateway와 IAM 리소스 생성 권한

기본 리전은 두 Web Search가 모두 지원하는 `us-east-1`입니다. 다른 리전은 [제한 사항](./limit.md)에서 시나리오별 지원 여부를 확인합니다.

AgentCore Web Search connector `1.2.0`을 설치하려면 AWS CLI 2.36.3 이상이 필요합니다.

```bash
aws --version
```

버전이 낮으면 [AWS CLI 업데이트 절차](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)를 따라 업데이트합니다.

## 로컬 인증

`aws login`으로 임시 세션을 만들고 현재 자격 증명을 확인합니다.

```bash
aws login
aws sts get-caller-identity
```

장기 Access Key와 루트 사용자 자격 증명은 사용하지 않습니다. 권한을 제한한 IAM 역할로 로그인합니다.

## 사용자 설정

`.env.example`을 복사합니다. AgentCore 시나리오를 실행할 때만 `OPENAI_API_KEY`를 실제 값으로 바꿉니다.

```bash
cp .env.example .env
```

`.env`와 AWS 임시 자격 증명을 담는 `.runtime.env`는 Git에서 제외됩니다. 파일 내용은 로그나 이슈에 남기지 않습니다.

## AgentCore 구성 범위

Terraform은 다음 리소스를 만듭니다.

- AWS IAM 인증을 사용하는 AgentCore Gateway
- Gateway 실행 역할과 최소 권한
- CloudWatch Logs 전송과 7일 보존 로그 그룹

AWS Provider가 connector target 설정을 지원하지 않으므로 target은 Terraform에서 제외합니다. `scripts/install-web-search-target.sh`와 `scripts/delete-web-search-target.sh`가 AWS CLI로 target을 관리합니다.

## AgentCore 기동

Bedrock 내장 Web Search는 이 단계가 필요 없습니다. AgentCore Gateway 생성, target 설치, LiteLLM 기동을 순서대로 실행합니다.

```bash
set -a
source .env
set +a
uv sync
terraform -chdir=terraform init
terraform -chdir=terraform apply -var "aws_region=$AWS_REGION"
./scripts/install-web-search-target.sh
./scripts/export-runtime-env.sh
docker compose up -d --wait
```

## AgentCore 정리

LiteLLM, target, Terraform 리소스를 역순으로 정리합니다.

```bash
set -a
source .env
set +a
docker compose down -v
./scripts/delete-web-search-target.sh
terraform -chdir=terraform destroy -var "aws_region=$AWS_REGION"
```
