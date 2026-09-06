# Agent Guide

- IAM Roles Anywhere의 인증서 인증·SDK 갱신·교체·폐기를 AgentCore Memory로 확인하는 독립 핸즈온.
- 공통 규칙: @../../../AGENTS.md
- 리전: ap-northeast-2. 기본 연결은 public endpoint.
- client/는 Leaf 인증서로 실행. scripts/의 CRL 관리 도구와 Terraform은 별도 관리 자격증명 사용.
- CA 개인 키·Leaf 개인 키·발급 DB·helper 바이너리는 ignored runtime/에만 보관.
- 실습 원리·실행·운영 문서와 실제 AWS 검증 상태를 분리.

## knowledge

이 workspace를 고치기 전에 `knowledge/index.md`를 먼저 읽는다. 걸리는 concept가 있으면 그 파일까지 읽는다. 읽지 않으면 이미 버려진 방법을 다시 고른다.

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
