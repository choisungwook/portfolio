---
okf_version: "0.1"
---

# Knowledge

STS와 AgentCore Memory의 public NLB 고정 IP 실험에서 유지할 설계 근거다.

* [PoC 범위를 S01·S05·S07로 축소](decisions/2026-09-poc-scope-s01-s05-s07.md)
* [AWS 안의 CONNECT proxy는 권장 구성이 아니다](decisions/2026-09-no-connect-proxy-in-aws.md)
* [실습 hosted zone의 등록기관 NS 권한](topics/demo-akbun-com-delegation.md)
* [AWS API 연결 실습의 위치](decisions/2026-09-network-lab-location.md)
* [Terraform 관리 인증과 실험 인증 분리](decisions/2026-09-terraform-management-role.md)
* [클라이언트는 로컬 AWS 프로파일로 시작](decisions/2026-09-client-profile-principal.md)
* [public NLB 진입과 AWS 권한 분리](decisions/2026-09-public-nlb-ingress.md)
* [AWS 호스트명과 TLS 유지](decisions/2026-09-preserve-aws-hostname.md)
* [DNS 변경 불가와 인증 방식 분리](decisions/2026-09-separate-auth-from-routing.md)

AI agent가 작업하면서 축적하는 지식 번들이다. Google이 제안한 [Open Knowledge Format(OKF) 0.1](references/okf-spec-0.1.md)을 따른다. 코드와 git history가 기록하지 못하는 의사결정의 이유, 반복 절차, 도메인 통찰을 markdown + YAML frontmatter로 남긴다.

## 디렉터리

* [decisions/](decisions/index.md) - 작업 중 내린 의사결정과 그 이유 (ADR)
* [playbooks/](playbooks/index.md) - 반복되는 작업 절차
* [topics/](topics/index.md) - 핸즈온을 반복하며 얻은 도메인 통찰
* [references/](references/index.md) - 외부 자료의 저장소 내 사본

## 읽기

이 workspace를 고치기 전에 이 파일을 먼저 읽는다. 이번 작업에 걸리는 concept가 있으면 그 파일까지 읽는다. 읽은 내용이 지금 아는 사실과 어긋나면 그 concept를 고치거나 지운다.

## 작성 규칙

concept 작성 규칙은 저장소 루트의 `.claude/rules/knowledge.md`를 따른다. 변경 이력은 [log.md](log.md)에 남긴다.
