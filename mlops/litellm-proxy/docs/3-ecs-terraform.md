# ECS Terraform 예시

## TL;DR

- Terraform은 ECS Fargate service, ALB, security group, CloudWatch Logs, task role을 만듭니다.
- LiteLLM 설정 파일은 [ecs-image](../ecs-image/) 이미지에 포함합니다.
- master key는 Secrets Manager secret ARN으로 전달합니다.
- 이 예제는 RDS를 만들지 않습니다. 운영용 DB 연결은 별도 설계가 필요하고 확인 필요입니다.

## ECS 이미지 만들기

예제 이미지는 LiteLLM 공식 이미지를 기반으로 config만 포함합니다.

```shell
cd mlops/litellm-proxy
docker build -t litellm-proxy-hands-on:latest ./ecs-image
```

ECR repository를 준비한 뒤 push합니다. 아래 값은 예시입니다.

```shell
AWS_REGION=ap-northeast-2
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME=litellm-proxy-hands-on
IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:latest"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker tag litellm-proxy-hands-on:latest "$IMAGE"
docker push "$IMAGE"
```

## master key secret 만들기

LiteLLM master key는 Terraform 변수에 평문으로 넣지 않습니다. Secrets Manager에 값을 만들고 ARN만 Terraform에 전달합니다.

```shell
aws secretsmanager create-secret \
  --name litellm-master-key-example \
  --secret-string 'sk-replace-with-strong-random-value'
```

출력된 ARN을 `litellm_master_key_secret_arn` 변수에 넣습니다.

## Terraform 변수

예제 변수 파일을 복사합니다.

```shell
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`에서 다음 값을 실제 환경에 맞게 바꿉니다.

```hcl
vpc_id                        = "vpc-..."
public_subnet_ids             = ["subnet-...", "subnet-..."]
allowed_cidr                  = "x.x.x.x/32"
container_image               = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/litellm-proxy-hands-on:latest"
litellm_master_key_secret_arn = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:..."
```

`allowed_cidr = "0.0.0.0/0"`은 실습 편의 기본값입니다.

장점: 접속 테스트가 쉽습니다.

단점: 인터넷 전체에서 ALB에 접근할 수 있습니다. 실제 환경에서는 본인 IP나 VPN CIDR로 좁혀야 합니다.

## 배포

Terraform을 실행합니다.

```shell
terraform init
terraform plan
terraform apply
```

ALB DNS 이름을 확인합니다.

```shell
terraform output alb_dns_name
```

## ECS 요청 테스트

ALB 주소로 요청합니다.

```shell
ALB_DNS=$(terraform output -raw alb_dns_name)

curl -sS "http://${ALB_DNS}/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer sk-replace-with-strong-random-value' \
  -d '{
    "model": "bedrock-claude",
    "messages": [
      {"role": "user", "content": "hello"}
    ]
  }'
```

## 정리

실습 리소스를 삭제합니다.

```shell
terraform destroy
```

Secrets Manager secret과 ECR image는 이 Terraform 예제 밖에서 만들었으므로 별도로 정리합니다.

## 확인 필요

- ECS task가 public subnet에서 public IP를 갖는 구성이 요구사항에 맞는지 확인 필요.
- 운영 환경에서는 private subnet, NAT Gateway 또는 VPC endpoint, HTTPS listener, WAF 적용 여부 확인 필요.
- LiteLLM UI와 spend tracking까지 쓰려면 PostgreSQL/RDS 연결 설계 확인 필요.
