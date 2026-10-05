# 이미지 배포와 설정 변경

- 준비: [AWS 환경 준비](1-setup.md).
- Pipeline 실행 변수 `IMAGE_TAG`는 필수. ECR에 없는 태그면 등록 전에 실패.
- `DetectChanges=false`라 push만으로 배포되지 않음. Pipeline을 직접 실행.

## 1. 이미지 배포

hello-beta에 v2 배포:

```bash
bash scripts/start-pipeline.sh ecs-shared-build-hello-beta v2
```

- CodeBuild 로그: `Registered: ...:N (v2 = sha256:...)` 뒤 `Deployed:`.
- `show-service.sh hello-beta`: `app_version=v2`, HTTP `image_version=v2`.
- hello-alpha는 변화 없음.

## 2. 설정만 변경

설정만 바꿔도 이미지 태그를 입력. 지금 운영 중인 태그는 Git이 아니라 ECS에서 조회:

```bash
arn=$(aws ecs describe-services --cluster ecs-shared-build-cluster --services hello-alpha \
  --query 'services[0].taskDefinition' --output text)
aws ecs describe-task-definition --task-definition "$arn" --include TAGS \
  --query "tags[?key=='app_version'].value" --output text
```

1. `deploy/task-definitions/hello-alpha.json`의 `LOG_LEVEL`을 `info` → `debug`로 수정.
2. commit·push.
3. 조회한 태그 그대로 Pipeline 실행.

조회한 태그가 v1일 때 alpha Pipeline 실행:

```bash
bash scripts/start-pipeline.sh ecs-shared-build-hello-alpha v1
```

- 새 revision 등록. 이미지 digest는 그대로, HTTP `log_level=debug`.
- 환경변수 삭제, CPU·메모리 변경도 같은 방법. JSON이 그대로 등록됨.
