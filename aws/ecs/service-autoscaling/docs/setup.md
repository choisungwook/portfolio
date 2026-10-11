# Setup

이 핸즈온은 로컬 컨테이너 1개와 AWS 리소스(ALB, ECS Fargate service, Application Auto Scaling target과 policy, SNS topic, EventBridge rule, security group, IAM role, log group, Action Logs delivery)를 사용합니다. ALB와 Fargate task는 떠 있는 동안 비용이 나가므로 실습이 끝나면 Down을 실행합니다.

## 준비물

- Docker
- Terraform 1.11 이상
- AWS CLI와 ap-northeast-2에 리소스를 만들 수 있는 AWS 자격 증명
- k6 (`brew install k6`)
- jq
- Session Manager plugin (`brew install --cask session-manager-plugin`, CPU 시나리오의 ECS Exec에 사용)

## Up

로컬 nginx 컨테이너를 띄우고 AWS 리소스를 만듭니다. 명령은 workspace 루트에서 실행하므로 저장소 루트에서 먼저 이동합니다.

```bash
cd aws/ecs/service-autoscaling
```

이동한 뒤 한 줄로 환경을 만듭니다. scaling 알림을 메일로 받으려면 `-var alert_email=<메일 주소>`를 apply 뒤에 붙이고, 도착한 확인 메일의 **Confirm subscription**을 누릅니다.

```bash
docker compose up -d --wait && terraform -chdir=terraform init && terraform -chdir=terraform apply
```

ALB DNS 이름은 생성 직후 1~2분 동안 resolve되지 않을 수 있습니다.

scaling 정책은 한 번에 하나만 만듭니다. 기본값은 요청 수 시나리오(`scaling_metric=requests`)입니다. [CPU 시나리오](./4-cpu-handson.md)는 같은 apply 명령 뒤에 `-var scaling_metric=cpu`를 붙여 실행합니다. 이미 만든 환경에서 바꾸면 기존 policy와 alarm이 지워지고 새 policy가 만들어집니다.

## Down

AWS 리소스와 로컬 컨테이너를 함께 지웁니다.

```bash
terraform -chdir=terraform destroy && docker compose down -v
```
