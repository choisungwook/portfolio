# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [OKF 기반 knowledge 번들 도입](2026-07-adopt-okf-knowledge-bundle.md) - agent 지식을 Open Knowledge Format 0.1로 기록하기로 한 결정.
* [AGENTS.md 단일 진입점](2026-07-agents-md-single-entrypoint.md) - agent 환경 파일을 AGENTS.md 중심으로 재구성한 결정.
* [Issue는 PR 생성 시점에 작성](2026-07-issue-at-pr-time.md) - 기록용 Issue를 작업 시작이 아닌 PR 생성 시점에 만드는 결정.
* [ElastiCache는 Valkey + RBAC/IAM 기본](2026-07-elasticache-valkey-rbac.md) - ElastiCache를 Redis 대신 Valkey로, AUTH token 단독 대신 RBAC/IAM 인증으로 만드는 결정.
* [Electron 릴리스 빌드는 macOS만](2026-07-electron-release-macos-only.md) - Windows 러너의 checkout 실패와 수요 부재로 릴리스 workflow를 macOS 빌드만 유지하는 결정.
* [릴리스 버전은 태그에서 계산한다](2026-07-release-version-from-tags.md) - 기존 태그의 patch를 +1 해서 매 실행마다 새 릴리스를 만드는 결정.
* [릴리스는 빌드 성공 뒤에 tag, tag 뒤에 release](2026-07-build-before-tag-and-release.md) - 빌드가 실패해도 빈 release가 남던 문제를 순서로 막는 결정.
* [규칙 문서는 도구 중립으로 쓰고 상시 로드 비용으로 정리한다](2026-07-agents-md-tool-neutral.md) - AGENTS.md에 도구 전용 내용을 두지 않고 규칙 파일을 코드 템플릿 대신 규칙 문장으로 유지하는 결정.
* [Apply only the saved plan file, never a fresh plan](2026-07-terraform-apply-saved-plan.md) - akbun-terraform-apply-remote가 마지막 plan이 저장한 tfplan 파일만 apply하고 PR head가 바뀌면 거부하는 결정.
* [Rust with a small synchronous stack for the terraform PR server](2026-07-rust-sync-stack-for-webhook-server.md) - async 프레임워크 없이 tiny_http/ureq 동기 스택으로 만들고 핵심 로직만 테스트하는 결정.
* [Deploys drain in-flight runs and hand state over via disk](2026-07-deploy-drain-and-persisted-takeover.md) - 멀티 노드 HA 대신 SIGTERM drain과 state.json 영속화로 배포 중 인수인계를 해결하는 결정.
* [GitHub App installation tokens as the recommended auth for the terraform bot](2026-07-github-app-tokens-for-terraform-bot.md) - 장기 PAT 대신 1시간짜리 App installation token을 권장 인증으로 두는 결정.
* [서명 없는 데스크톱 앱의 자동 업데이트는 dmg를 받아 번들을 교체한다](2026-07-unsigned-desktop-app-self-update.md) - electron-updater가 막힌 상황에서 dmg 교체 방식을 모든 데스크톱 product의 기본으로 두는 결정.
