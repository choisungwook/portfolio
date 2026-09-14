# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-09-14

* **Creation**: [환경변수 변경도 config 파이프라인으로 배포한다](decisions/2026-09-config-pipeline-not-terraform.md) 결정 기록. 이력을 CodePipeline 한 곳에 모으려고 terraform에서 task definition 소유권을 뺐다.
* **Creation**: [latest tag push로 깨우고 버전 tag로 배포한다](decisions/2026-09-latest-trigger-version-tag-deploy.md) 결정 기록. ECR source action의 ImageTag 고정 제약을 우회하는 방법.
* **Creation**: [terraform은 ECS가 바꾸는 상태를 무시한다](decisions/2026-09-terraform-ignores-ecs-managed-state.md) 결정 기록. 배포 후 listener rule과 target group 짝이 바뀌는 drift.
* **Creation**: [hook은 첫 배포를 통과시킨다](decisions/2026-09-hook-skips-first-deployment.md) 결정 기록. create-service도 lifecycle hook을 부른다는 사실.
