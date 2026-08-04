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
* [PR body 형식의 기준은 pull request template 하나다](2026-07-pr-body-format-in-template.md) - PR body를 Decisions와 Implementation으로 바꾸고 형식을 template 한 곳에만 두는 결정.
* [pptx import는 OOXML을 직접 파싱하고 검증은 생성기가 다른 corpus로 한다](2026-08-pptx-import-parses-ooxml-directly.md) - PowerPoint 덱의 상속 체계(테마 색, placeholder, 배경, 페이지 크기)를 reader가 해석하고 단일 샘플 과적합을 corpus 교차 검증으로 막는 결정.
* [Tauri 앱의 썸네일은 webview가 그리고 Rust는 바이트만 저장한다](2026-08-thumbnails-in-the-webview.md) - akbun-folderview의 썸네일 캐시를 Rust 이미지 라이브러리 없이 canvas로 생성하기로 한 결정.
* [핸즈온은 terraform으로 기반까지만 만들고 학습 대상은 console에서 조작한다](2026-08-handson-terraform-base-console-operation.md) - terraform 범위를 기반 리소스로 한정하는 결정과 state 밖 리소스가 만드는 비용.
* [화살표 선분은 둥근 마감을 쓰지 않고 머리 길이를 화살표 길이로 제한한다](2026-08-arrow-shaft-square-cap.md) - 화살표 끝에 구슬 같은 점이 붙던 현상을 두 product에서 같은 방식으로 없앤 결정.
* [영상 편집 도구의 시간은 프레임 수와 두 정수 rate로 표현한다](2026-08-rational-time-model.md) - 밀리초 정수 시간을 유리수 시간 모델로 바꾸고 29.97 같은 실촬영 frame rate를 정확히 다루기로 한 결정.
* [편집 모델은 backend가 소유하고 편집은 역연산을 가진 명령으로 표현한다](2026-08-edit-model-owned-by-the-backend.md) - 편집 상태 소유권을 페이지에서 Rust로 옮기고 undo를 상태 복사가 아닌 명령 이력으로 만든 결정.
