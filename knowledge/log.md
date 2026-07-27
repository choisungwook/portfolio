# Knowledge Update Log

## 2026-07-27

* **Creation**: [비대칭 라우팅은 경로가 아니라 상태 때문에 깨진다](topics/asymmetric-routing-breaks-on-state.md) topic 작성. computer_science/asymmetric_routing 핸즈온을 만들면서 남긴다.
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
