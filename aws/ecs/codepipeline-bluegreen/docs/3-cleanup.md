# Cleanup

정리는 [setup.md](./setup.md)의 Down 한 줄이면 끝나요.

## 지워지는 것

terraform이 만든 리소스 전부와, 실습 중에 파이프라인이 만든 것들까지 함께 지워져요.

- ECR 이미지: repository에 force_delete를 켜 두어서 v1, v2, latest가 남아 있어도 repository째 지워져요.
- S3 object 버전: 두 bucket 모두 force_destroy라 config.zip의 모든 버전과 파이프라인 artifact가 함께 지워져요.
- task definition revision: 파이프라인이 등록한 revision은 terraform state에 없어요. 서비스와 cluster가 지워지면 쓰이지 않는 상태로 남지만 과금되지 않아요. 깔끔하게 하고 싶으면 아래처럼 INACTIVE로 내릴 수 있어요.

revision 목록을 받아 모두 deregister하는 명령이에요.

```bash
aws ecs list-task-definitions --family-prefix ecs-bluegreen-web --query 'taskDefinitionArns[]' --output text | xargs -n1 aws ecs deregister-task-definition --task-definition
```

## destroy가 멈출 때

ECS 서비스 삭제는 task를 0으로 줄이고 drain하는 시간이 있어서 1~2분 걸려요. 배포가 진행 중일 때 destroy를 시작하면 ECS가 먼저 배포를 정리하느라 더 걸릴 수 있어요. 배포가 끝난 뒤 destroy하는 게 가장 빨라요.
