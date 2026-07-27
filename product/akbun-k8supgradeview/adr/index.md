# ADR

akbun-k8supgradeview 프로젝트의 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [kubectl 직접 실행](2026-07-kubectl-exec.md) - Kubernetes client 라이브러리 대신 kubectl 명령을 실행하기로 한 결정.
* [Electron + TypeScript, 번들러 없는 빌드](2026-07-electron-typescript.md) - 기술 스택과 tsc 단독 빌드 구성을 정한 결정.
* [package.json version 기반 macOS arm64 전용 릴리즈](2026-07-release-workflow.md) - version을 태그로 쓰고 macOS arm64 dmg만 빌드하기로 한 결정.
* [업데이트는 dmg 직접 내려받기와 번들 교체](2026-07-update-download-and-swap.md) - GitHub Release 조회와 .app 교체로 업데이트를 구현하고 디스크 누수 방지를 테스트로 검증하기로 한 결정.
* [cordon과 uncordon은 노드 행의 토글 버튼 하나로 둔다](2026-07-node-cordon-toggle.md) - Action 칼럼에 상태에서 파생되는 버튼 하나를 두고 실행 전 확인 dialog를 두기로 한 결정.
