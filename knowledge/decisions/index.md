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
* [학습지 HTML은 핸즈온 workspace 안에 둔다](2026-07-studysheet-in-workspace.md) - skill의 Downloads 저장 규칙 대신 실습 코드와 같은 커밋에서 버전 관리하는 결정.
