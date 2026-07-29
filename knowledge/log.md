# Knowledge Update Log

## 2026-07-29

* **Creation**: [Deploys drain in-flight runs and hand state over via disk](decisions/2026-07-deploy-drain-and-persisted-takeover.md) 결정 기록. akbun-terraform-apply-remote에 graceful drain, 상태 영속화, EC2/ECS 배포 스택을 추가하면서 남긴다.
* **Creation**: [Apply only the saved plan file, never a fresh plan](decisions/2026-07-terraform-apply-saved-plan.md) 결정 기록. akbun-terraform-apply-remote 제품을 만들면서 남긴다.
* **Creation**: [Rust with a small synchronous stack for the terraform PR server](decisions/2026-07-rust-sync-stack-for-webhook-server.md) 결정 기록. 같은 작업에서 기술 스택 선택 이유를 남긴다.

## 2026-07-28

* **Creation**: [규칙 문서는 도구 중립으로 쓰고 상시 로드 비용으로 정리한다](decisions/2026-07-agents-md-tool-neutral.md) 결정 기록. AGENTS.md 정리와 `.claude/rules/terraform.md`의 코드 템플릿 제거와 함께 남긴다.
* **Update**: [ElastiCache는 Valkey + RBAC/IAM 기본](decisions/2026-07-elasticache-valkey-rbac.md)에서 terraform 규칙의 HCL 패턴을 가리키던 문장을 갱신했다. 해당 HCL 블록이 규칙 문장으로 대체됐다.

## 2026-07-27

* **Creation**: [Karpenter over-provisioning은 음수 우선순위 placeholder로 노드를 미리 잡아 둔다](topics/karpenter-overprovisioning.md) topic 작성. akbun-k8supgradeview에 over-provisioning manifest 생성 기능을 넣으면서 남긴다.

## 2026-07-25

* **Creation**: [Electron 릴리스 빌드는 macOS만](decisions/2026-07-electron-release-macos-only.md) 결정 기록. akbun-gitdesktop 릴리스 workflow의 Windows checkout 실패 수정과 함께 남긴다.
* **Creation**: [릴리스 버전은 태그에서 계산한다](decisions/2026-07-release-version-from-tags.md) 결정 기록. akbun-gitdesktop 릴리스 workflow를 태그 기반 patch 자동 증가로 바꾸면서 남긴다.
* **Creation**: [릴리스는 빌드 성공 뒤에 tag, tag 뒤에 release](decisions/2026-07-build-before-tag-and-release.md) 결정 기록. akbun-shadowing-player 릴리스 workflow의 job 순서를 바꾸면서 남긴다.

## 2026-07-11

* **Creation**: [ElastiCache는 Valkey + RBAC/IAM 기본](decisions/2026-07-elasticache-valkey-rbac.md) 결정 기록. `.claude/rules/terraform.md`에 ElastiCache 규칙(Valkey 엔진, RBAC user group, IAM 인증, TLS/암호화) 추가와 함께 남긴다.

## 2026-07-10

* **Initialization**: OKF 0.1 기반 knowledge 번들 생성.
* **Creation**: [OKF 기반 knowledge 번들 도입](decisions/2026-07-adopt-okf-knowledge-bundle.md) 결정 기록.
* **Creation**: [AGENTS.md 단일 진입점](decisions/2026-07-agents-md-single-entrypoint.md) 결정 기록.
* **Creation**: [Issue는 PR 생성 시점에 작성](decisions/2026-07-issue-at-pr-time.md) 결정 기록.
* **Creation**: [새 핸즈온 추가 절차](playbooks/add-new-hands-on.md) playbook 작성.
* **Creation**: [OKF v0.1 스펙 사본](references/okf-spec-0.1.md) 저장. 외부 링크 의존을 제거하고 로컬 사본을 참조한다.
