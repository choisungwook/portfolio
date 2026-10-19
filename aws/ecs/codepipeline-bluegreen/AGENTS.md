# ECS blue/green with CodePipeline and CodeBuild

ECS 네이티브 blue/green 배포와 lifecycle hook을 CodePipeline + CodeBuild(AWS CLI)로 구동하는 핸즈온 workspace다.

글로벌 규칙은 [@../../../AGENTS.md](../../../AGENTS.md)를 따른다.

## 구조

- `app/` nginx 이미지. index.html body와 /env, /health 응답을 환경변수로 바꾼다.
- `hook/` POST_TEST_TRAFFIC_SHIFT에서 test listener의 /health를 검사하는 Lambda.
- `pipeline/` 두 파이프라인이 공유하는 buildspec과 config 파이프라인의 입력 env.json.
- `terraform/` ECR, ALB, ECS, Lambda, S3, CodeBuild, CodePipeline, EventBridge, IAM.
- `docs/` 핸즈온 본문.

## knowledge

이 workspace를 고치기 전에 `knowledge/index.md`를 먼저 읽는다. 걸리는 concept가 있으면 그 파일까지 읽는다. 읽지 않으면 이미 버려진 방법을 다시 고른다.

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
