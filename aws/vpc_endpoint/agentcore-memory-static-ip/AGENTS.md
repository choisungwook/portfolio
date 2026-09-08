# Agent Guide

- STS 인증과 AgentCore Memory를 public NLB 고정 EIP로 호출하는 5개 시나리오의 핸즈온. S01 hosts 변경, S02 앱 네트워크 Squid forward proxy(DNS 변경 불가 시 권장), S05 자체 도메인 실패 확인, S06 자체 도메인 TLS 재암호화 직결(판정 미확정, 실제 AWS 실행 전), S07 AWS 안 CONNECT 프록시(비권장 참고용).
- 공통 규칙: @../../../AGENTS.md
- AWS 리전: ap-northeast-2.
- DNS, TLS SNI, HTTP Host, SigV4 서명 호스트를 함께 유지.
- 실제 AWS 검증 결과와 로컬 모의 검증 결과를 구분.
- 요구사항 분류는 docs/0-requirements.md, 시나리오별 문서는 docs/scenarios/에 유지.
- terraform/은 S01과 S05의 Route 53 레코드, S06 opt-in TLS NLB(acm_certificate_arn·tls_alias_domains), terraform/labs/s07은 기존 VPC를 입력받는 독립 state.
- S06 실제 실행 결과가 나오면 docs/4-validation.md의 S06 행과 docs/scenarios/s06/2-experiment.md의 판정 줄을 함께 갱신.
- Roles Anywhere는 aws/iam/roles-anywhere에서 다룸. 이 workspace에 다시 넣지 않고 README 심화학습 항목으로 유지.
- 인증 방식 변경으로 DNS·서버 TLS 제약이 해소된다고 설명하지 않음.

## knowledge

이 workspace를 고치기 전에 `knowledge/index.md`를 먼저 읽는다. 걸리는 concept가 있으면 그 파일까지 읽는다. 읽지 않으면 이미 버려진 방법을 다시 고른다.

이 workspace의 작업에서 얻은 지식은 `knowledge/`에 계속 반영한다. 추가만이 아니라 수정과 삭제까지 포함한다.

- 새로 알게 된 의사결정, 반복 절차, 도메인 통찰은 concept로 추가한다.
- 기존 concept와 어긋나는 사실을 알게 되면 그 concept를 고친다. 새 파일을 만들어 두 개를 남기지 않는다.
- 더 이상 맞지 않는 concept는 지운다. 틀린 기록을 남겨 두면 다음 작업이 그것을 믿는다.
- 추가·수정·삭제 뒤에는 해당 `index.md`와 `log.md`를 같은 commit에서 갱신한다.

작성 형식은 [.claude/rules/knowledge.md](../../../.claude/rules/knowledge.md)를 따른다.
