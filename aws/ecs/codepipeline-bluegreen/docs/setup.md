# Setup

이 핸즈온은 AWS 계정(ap-northeast-2)에 실제 리소스를 만들어요. 실습을 마치면 꼭 Down 단계로 정리해 주세요.

## 준비물

로컬 머신(macOS 기준)에 아래가 있어야 해요.

| 도구 | 용도 |
| --- | --- |
| Docker (buildx 포함) | nginx 이미지를 arm64로 빌드해서 ECR에 push |
| Terraform >= 1.11 | AWS 리소스 생성 |
| AWS CLI v2 | ECR 로그인, S3 업로드, 배포 상태 조회 |
| make, zip | Makefile 실행, 설정 파일 압축 |

AWS 자격증명은 ap-northeast-2에서 ECS, ALB, ECR, CodePipeline, CodeBuild, Lambda, S3, IAM을 만들 수 있어야 해요. 개인 계정의 관리자 권한이면 충분합니다.

## 비용

떠 있는 동안 계속 과금되는 것은 ALB 한 대와 Fargate task 두 개예요. 배포가 진행되는 몇 분 동안은 green task 두 개가 더 뜨고, CodeBuild가 분 단위로 과금돼요. 하루 안에 실습하고 정리하면 몇 달러 수준입니다.

## Up

workspace 루트(aws/ecs/codepipeline-bluegreen)에서 실행해요. 로컬 이미지 확인, AWS 리소스 생성, 서비스 안정화 대기, 첫 이미지 push까지 한 줄로 끝나요.

```bash
docker compose up -d --build && terraform -chdir=terraform init && terraform -chdir=terraform apply -auto-approve && make wait push TAG=v1
```

apply가 끝나면 서비스는 public nginx 이미지로 먼저 떠요. ECR이 비어 있어도 서비스가 healthy 상태에서 시작하도록 한 선택이에요. 마지막 make push가 v1 이미지를 밀어 넣으면서 첫 파이프라인 실행이 시작돼요. 이후 절차는 [2-handson.md](./2-handson.md)에서 이어져요.

로컬 컨테이너는 http://localhost:8080 에서 확인할 수 있어요. 이미지가 어떻게 생겼는지 보는 용도라 AWS 실습과는 무관해요.

## Down

파이프라인이 만든 task definition revision과 ECR 이미지, S3 object는 terraform이 강제로 함께 지워요.

```bash
terraform -chdir=terraform destroy -auto-approve && docker compose down -v
```
