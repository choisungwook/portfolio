# 환경 구성

## 준비물

- Docker와 Docker Compose
- Terraform 1.11 이상
- AWS CLI v2
- uv
- jq와 curl
- Web Search 지원 리전의 AWS 리소스를 만들 권한

이 실습의 기본 리전은 `us-east-1`입니다. `eu-west-1`과 `ap-northeast-1`도 선택할 수 있지만 `ap-northeast-2`는 지원하지 않습니다.

## 로컬 인증

로컬에서는 `aws login`으로 만든 임시 세션을 사용합니다. 장기 Access Key를 파일에 저장하지 않습니다.

```bash
aws login
aws sts get-caller-identity
```

루트 사용자의 세션도 기술적으로 동작하지만 실습과 운영 모두에서 사용하지 않는 편이 안전합니다. 권한을 제한한 IAM 역할로 로그인합니다.

## 사용자 설정

`.env.example`을 복사하고 `OPENAI_API_KEY`만 실제 값으로 바꿉니다. 다른 값은 로컬 기본값으로 바로 사용할 수 있습니다.

```bash
cp .env.example .env
```

```dotenv
OPENAI_API_KEY=replace-me
OPENAI_MODEL=gpt-4.1-mini
LITELLM_MASTER_KEY=sk-local-agentcore
LITELLM_PORT=4001
AWS_PROFILE=default
```

`.env`와 AWS 임시 세션을 담는 `.runtime.env`는 Git에서 제외됩니다. 출력이나 이슈 본문에도 값을 붙이지 않습니다.

## 인프라 구성

Terraform은 다음 리소스를 만듭니다.

- AWS IAM 인증을 사용하는 AgentCore Gateway
- Web Search connector `1.2.0` target
- Gateway 실행 역할과 최소 권한
- CloudWatch Logs 전송과 7일 보존 로그 그룹

AWS Provider가 connector target 설정을 아직 직접 노출하지 않아 Terraform의 `local-exec`에서 Boto3를 호출합니다. target도 Terraform lifecycle에 포함되어 생성·갱신·삭제됩니다.

## 운영 인증

운영에서는 `.runtime.env`를 만들지 않습니다. EC2 instance profile, ECS task role, EKS Pod Identity 또는 실행 환경의 IAM 역할을 표준 AWS credential chain으로 읽습니다.

호출 역할에는 Terraform 출력의 최소 권한 정책을 붙입니다.

```bash
terraform -chdir=terraform output -raw caller_policy_json
```

Gateway 실행 역할과 호출 역할을 분리합니다. 세션 자격 증명이나 OpenAI 키를 이미지, Terraform 변수, 로그에 넣지 않습니다.

## 기동

```bash
make up
```

## 종료와 정리

```bash
make down
```
