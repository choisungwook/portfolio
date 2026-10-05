# AWS 환경 준비와 정리

- 필요 도구: Terraform 1.11 이상, AWS CLI v2, jq, Docker buildx.
- 실행 위치: `aws/ecs/shared-codebuild-deploy`.

## 준비

AWS 프로필과 리전 지정:

```bash
export AWS_PROFILE=terraform-awscli
export AWS_DEFAULT_REGION=ap-northeast-2
```

tfvars 복사 후 값 수정:

```bash
cp foundation/terraform.tfvars.example foundation/terraform.tfvars
cp workload/terraform.tfvars.example workload/terraform.tfvars
```

- foundation `allowed_cidr`: 내 공인 IP/32 (`curl -4 https://api.ipify.org`).
- workload `github_repository`, `github_branch`: 배포 소스 저장소와 branch.
- workload `source_directory`: 저장소 root 기준 이 디렉터리. 단독 저장소면 `.`.

## 1. foundation 생성과 GitHub 연결 승인

기반 리소스 생성:

```bash
terraform -chdir=foundation init
terraform -chdir=foundation apply
```

- 콘솔 Developer Tools → Settings → Connections에서 생성된 연결 선택.
- Update pending connection으로 GitHub App 설치. 상태가 `AVAILABLE`인지 확인.

## 2. 이미지 준비와 workload 생성

ECR에 v1·v2 이미지 push 후 최초 task definition·service·Pipeline 생성:

```bash
bash scripts/bootstrap-images.sh
terraform -chdir=workload init
terraform -chdir=workload apply
```

- Terraform의 task definition은 최초 생성 전용 (`ignore_changes = all`).
- service는 `ignore_changes = [task_definition]`. 이후 Terraform apply가 배포를 되돌리지 않음.

## 3. task definition을 Git JSON으로 추출

service가 지금 쓰는 task definition을 JSON으로 저장:

```bash
bash deploy/export-taskdef.sh ecs-shared-build-cluster hello-alpha
bash deploy/export-taskdef.sh ecs-shared-build-cluster hello-beta
```

- 읽기 전용 필드와 빈 값 제거, image는 `__IMAGE__`로 교체.
- 계정 ID가 들어간 role ARN도 그대로 저장. 계정이 다르면 다시 추출.
- 추출한 JSON을 commit·push. Pipeline은 GitHub branch의 JSON을 읽음.

## 4. 상태 확인

서비스의 revision, `app_version`, 이미지, HTTP 응답 조회:

```bash
bash scripts/show-service.sh hello-alpha
bash scripts/show-service.sh hello-beta
```

## 정리

Terraform 리소스 삭제:

```bash
terraform -chdir=workload destroy
terraform -chdir=foundation destroy
```

- 배포 스크립트가 등록한 revision은 Terraform state 밖. 필요하면 콘솔에서 deregister.
