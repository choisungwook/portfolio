# Setup

이 핸즈온은 로컬 컨테이너 1개와 AWS 리소스(ALB, 대상 그룹 2개, ECS Fargate service, 태스크 정의 revision 3개, security group, IAM role 2개, log group, ECS 이벤트 기록)를 사용합니다. ALB와 Fargate 태스크는 떠 있는 동안 비용이 나가므로 실습이 끝나면 Down을 실행합니다.

## 준비물

- Docker
- Terraform 1.11 이상
- AWS CLI와 ap-northeast-2에 리소스를 만들 수 있는 AWS 자격 증명

## Up

명령은 workspace 루트에서 실행하므로 저장소 루트에서 먼저 이동합니다.

```bash
cd aws/ecs/circuit-breaker
```

이동한 뒤 한 줄로 환경을 만듭니다. 로컬 컨테이너는 정상 revision과 같은 이미지와 컨테이너 health check로 뜨고, `--wait`가 health check 통과를 기다립니다. 로컬에서 health check 명령이 실패하면 apply까지 가지 않습니다.

```bash
docker compose up -d --wait && terraform -chdir=terraform init && terraform -chdir=terraform apply
```

- ALB security group은 apply를 실행한 PC의 공인 IP/32만 허용합니다. 공유기 IP가 바뀌면 apply를 다시 실행합니다.
- ALB DNS 이름은 생성 직후 1~2분 동안 resolve되지 않을 수 있습니다.

## Down

AWS 리소스와 로컬 컨테이너를 함께 지웁니다.

```bash
terraform -chdir=terraform destroy && docker compose down -v
```
