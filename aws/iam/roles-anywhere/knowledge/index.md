---
okf_version: "0.1"
---

# Knowledge

IAM Roles Anywhere 인증서 수명과 SDK 갱신·CRL 실습의 설계 근거다.

* [Roles Anywhere 실습을 30분 컨셉 범위로 축소](decisions/2026-09-thirty-minute-concept-scope.md)
* [인증서 수명과 AWS 세션 수명 분리](decisions/2026-09-certificate-lifecycle-boundaries.md)
* [실습 CRL 관리와 정리 범위](decisions/2026-09-crl-management-ownership.md)
* [고정 IP 경로의 Roles Anywhere 시나리오는 나중에 S01 확장으로](decisions/2026-09-fixed-ip-scenario-deferred.md)

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
