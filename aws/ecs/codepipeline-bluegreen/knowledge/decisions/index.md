# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

concept를 추가할 때마다 `* [제목](파일명.md) - 한 문장 요약.` 형식으로 여기에 한 줄 추가한다. 수정하면 요약을 고치고, 삭제하면 줄을 지운다.

* [환경변수 변경도 config 파이프라인으로 배포한다](2026-09-config-pipeline-not-terraform.md) - terraform은 초기 revision만 만들고 이후 revision은 전부 파이프라인이 등록한다.
* [latest tag push로 깨우고 버전 tag로 배포한다](2026-09-latest-trigger-version-tag-deploy.md) - ECR source의 ImageTag는 고정이라 latest로 트리거하고 imageDetail.json에서 버전 tag를 고른다.
* [terraform은 ECS가 바꾸는 상태를 무시한다](2026-09-terraform-ignores-ecs-managed-state.md) - listener rule action과 서비스 task_definition, load_balancer는 ignore_changes.
* [hook은 첫 배포를 통과시킨다](2026-09-hook-skips-first-deployment.md) - create-service도 hook을 부르므로 배포 수가 1개 이하면 SUCCEEDED.
