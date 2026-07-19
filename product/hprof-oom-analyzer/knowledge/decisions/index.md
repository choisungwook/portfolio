# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [TypeScript + Electron 전환](2026-07-electron-typescript-rewrite.md) - Python/Tkinter 구현을 TypeScript + Electron으로 다시 만든 결정.
* [retained size는 클래스 제거 근사로 계산](2026-07-retained-size-approximation.md) - dominator tree 대신 도달 가능 바이트 감소량으로 근사한 결정.
* [renderer는 모듈 없는 스크립트로 작성](2026-07-renderer-script-without-modules.md) - 렌더러 코드를 import/export 없이 module: none으로 컴파일하는 결정.
* [deprecated transitive 의존성은 scoped overrides로 교체](2026-07-npm-overrides-deprecated-deps.md) - electron-builder가 끌어오는 glob 7, rimraf 2를 실행되지 않는 경로만 골라 교체한 결정.
* [mac 배포는 서명 없이 xattr 안내로 대응](2026-07-unsigned-mac-distribution.md) - notarization 대신 release notes의 xattr 안내로 Gatekeeper 오류에 대응한 결정.
