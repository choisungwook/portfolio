# ECR lifecycle digest hands-on 공통 준비

## 전제

- multi-arch 이미지는 사용하지 않습니다.
- ECR repository 하나에서 개발환경 tag와 운영환경 tag를 함께 씁니다.
- ECR tag는 immutable로 운용합니다.
- 개발환경 tag는 `d-*` prefix를 사용합니다.
- 운영환경 tag는 semantic version 형태의 `vx.x.x` prefix를 사용합니다.
- 운영환경(vx.x.x) 이미지는 개발환경(d-*) cleanup rule이 삭제하지 못하게 guard rule을 둡니다.
- 운영환경(vx.x.x) `countNumber=9999`는 사실상 무한 보존 guard로 사용합니다. 단, 운영환경(vx.x.x) image가 9999개를 넘으면 이 rule도 운영 image를 expire할 수 있습니다.
- 이 핸즈온은 로컬 재현성을 위해 간단한 FastAPI image를 사용합니다.

## 개념 정리

ECR tag, image digest, layer의 관계는 다음처럼 생각합니다.

```text
ECR tag 1개 -> image digest 1개
image digest 1개 <- tag 여러 개 가능
image digest -> config digest + layer digests
```

## 파일 구조

이 실습 디렉터리의 구조는 다음과 같습니다.

```text
aws/ecr
├── README.md
├── app/
│   ├── Dockerfile
│   ├── main.py
│   ├── version.py
│   └── requirements.txt
├── docs/
│   ├── README.md
│   ├── 00-setup.md
│   ├── 01-shared-digest-tag-delete.md
│   ├── 02-lifecycle-dev-cleanup-without-guard.md
│   ├── 03-lifecycle-dev-cleanup-prod-guard.md
│   ├── 04-metadata-digest.md
│   ├── cleanup.md
│   └── debugging.md
└── terraform/
    ├── ecr.tf
    ├── lifecycle_policy.tf
    ├── locals.tf
    ├── outputs.tf
    ├── providers.tf
    ├── terraform.tf
    ├── terraform.tfvars.example
    └── variables.tf
```

## Terraform 사전준비

Terraform 예제는 ECR repository를 만들고, lifecycle policy는 기본값으로 비활성화합니다.

장점: 시나리오 1에서 lifecycle 영향 없이 tag와 digest 관계만 먼저 확인할 수 있습니다.

단점: 실제 lifecycle policy를 적용하는 시나리오 3으로 넘어갈 때 `enable_lifecycle_policy=true`를 명시해야 합니다.

Terraform 변수 예시는 다음 파일을 복사해서 사용합니다.

```bash
cd aws/ecr/terraform
cp terraform.tfvars.example terraform.tfvars
```

ECR repository만 먼저 생성합니다.

```bash
terraform init
terraform apply
terraform output
```

`force_delete=true`는 실습 cleanup을 쉽게 하기 위한 기본값입니다.

장점: image가 남아 있어도 `terraform destroy`로 repository를 정리하기 쉽습니다.

단점: 운영 repository에서는 image를 실수로 지울 수 있으므로 사용하면 안 됩니다.

확인 필요: `hashicorp/aws` provider 버전은 적용 시점에 Terraform Registry에서 최신 안정 버전을 다시 확인합니다.

## 공통 환경 변수

이후 명령은 `aws/ecr` 디렉터리에서 실행한다고 가정합니다.

```bash
cd aws/ecr
```

AWS 계정과 ECR repository 정보를 환경 변수로 둡니다.

```bash
AWS_REGION=ap-northeast-2
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME=ecr-lifecycle-digest-hands-on
REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPO_NAME}"
```

Docker에서 ECR에 push할 수 있도록 로그인합니다.

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"
```

## 다음 단계

- [시나리오 1](./01-shared-digest-tag-delete.md)
- [시나리오 2](./02-lifecycle-dev-cleanup-without-guard.md)
- [시나리오 3](./03-lifecycle-dev-cleanup-prod-guard.md)
- [시나리오 4](./04-metadata-digest.md)
