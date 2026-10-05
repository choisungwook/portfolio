---
okf_version: "0.1"
---

# Knowledge

- ECS 공용 CodeBuild 배포 핸즈온의 결정 이유.
- 형식: [Open Knowledge Format 0.1](references/okf-spec-0.1.md).
- [Terraform으로 최초 생성, 추출한 JSON을 Git에서 관리](decisions/2026-10-git-task-template.md).
- [배포 완료는 rolloutState를 직접 조회해 판정](decisions/2026-10-deployment-guard-scope.md).
- [모노레포 소스 전달을 clone 참조로 전환](decisions/2026-10-source-clone-reference.md).

## 디렉터리

- [decisions/](decisions/index.md) - 작업 중 내린 의사결정과 그 이유 (ADR)
- [playbooks/](playbooks/index.md) - 반복되는 작업 절차
- [topics/](topics/index.md) - 핸즈온을 반복하며 얻은 도메인 통찰
- [references/](references/index.md) - 외부 자료의 저장소 내 사본

## 읽기

이 workspace를 고치기 전에 이 파일을 먼저 읽는다. 이번 작업에 걸리는 concept가 있으면 그 파일까지 읽는다. 읽은 내용이 지금 아는 사실과 어긋나면 그 concept를 고치거나 지운다.

## 작성 규칙

concept 작성 규칙은 저장소 루트의 `.claude/rules/knowledge.md`를 따른다. 변경 이력은 [log.md](log.md)에 남긴다.
