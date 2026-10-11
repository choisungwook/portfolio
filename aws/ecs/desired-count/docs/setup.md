# Setup

이 핸즈온은 로컬 컨테이너 1개와 AWS 리소스(ALB, ECS Fargate service, security group, IAM role, log group, ECS 이벤트를 log group으로 보내는 EventBridge rule과 Action Logs delivery)를 사용합니다. ALB와 Fargate task는 떠 있는 동안 비용이 나가므로 실습이 끝나면 Down을 실행합니다.

## 준비물

- Docker
- Terraform 1.11 이상
- AWS CLI와 ap-northeast-2에 리소스를 만들 수 있는 AWS 자격 증명
- jq (8단계에서 이벤트 JSON을 읽을 때 사용)

## Up

로컬 nginx 컨테이너를 띄우고 AWS 리소스를 만듭니다. 명령은 workspace 루트에서 실행하므로 저장소 루트에서 먼저 이동합니다.

```bash
cd aws/ecs/desired-count
```

이동한 뒤 한 줄로 환경을 만듭니다.

```bash
docker compose up -d --wait && terraform -chdir=terraform init && terraform -chdir=terraform apply
```

ALB DNS 이름은 생성 직후 1~2분 동안 resolve되지 않을 수 있습니다.

## Down

AWS 리소스와 로컬 컨테이너를 함께 지웁니다.

```bash
terraform -chdir=terraform destroy && docker compose down -v
```
