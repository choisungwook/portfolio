# Agent Guide

- IAM Roles Anywhere 30분 컨셉 핸즈온. 사설 CA → 인증서 인증 → CN 거부 → 교체 → CRL 폐기를 AgentCore Memory로 확인. 2026-09-06 실제 AWS 검증.
- 공통 규칙: @../../../AGENTS.md
- 리전: ap-northeast-2, public endpoint. 관리 명령은 AWS_PROFILE=admin, 클라이언트 인증은 인증서만.
- 코드는 루트의 자기완결 파일 4개(pki.py, run.py, crl_aws.py, install_helper.py). 패키지·모듈 분리를 다시 만들지 않는다.
- CA 개인 키·Leaf 개인 키·발급 DB·helper·lab.json은 ignored runtime/에만 둔다. 문서·예제의 계정은 123456789012.
- 75분 갱신 관찰·세션 회수·PrivateLink는 범위 밖. docs/2-handson.md "더 해 보기"에만 둔다.
- 고정 IP 경로는 aws/vpc_endpoint/agentcore-memory-static-ip에서 다룬다. 여기에 네트워크 시나리오를 넣지 않는다.

## knowledge

이 workspace를 고치기 전에 `knowledge/index.md`를 먼저 읽는다. 걸리는 concept가 있으면 그 파일까지 읽는다. 읽지 않으면 이미 버려진 방법을 다시 고른다.

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
