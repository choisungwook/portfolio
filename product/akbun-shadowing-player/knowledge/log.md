# Knowledge Update Log

## 2026-07-28

* **Creation**: [웹 배포는 renderer를 그대로 두고 window.api만 브라우저 구현으로 갈아 끼운다](decisions/2026-07-web-build-window-api-shim.md) 결정 기록. shadowing.akbun.com Cloudflare 배포 작업.

## 2026-07-25 (4차)

* **Creation**: [릴리스 버전의 단일 출처를 package.json으로 되돌림](decisions/2026-07-version-source-package-json.md) 결정 기록. tag 자동 계산 결정을 대체.

## 2026-07-25 (3차)

* **Creation**: [업데이트는 dmg를 직접 받아 앱 번들을 교체한다](decisions/2026-07-update-download-and-swap.md) 결정 기록.
* **Creation**: [테마는 CSS 변수와 light-dark()로 두되 canvas 색만 예외로 둔다](decisions/2026-07-theme-css-vars-canvas-exception.md) 결정 기록.

## 2026-07-25 (2차)

* **Creation**: [릴리스 버전은 tag에서 마이너 +1로 자동 계산](decisions/2026-07-release-tag-auto-minor-bump.md) 결정 기록.
* **Creation**: [로그는 macOS 관례 위치에 자체 rotation 로거로 기록](decisions/2026-07-file-logger-macos-logs-dir.md) 결정 기록.
* **Update**: 제품 이름을 shadowing-player에서 akbun-shadowing-player로 변경. 문서 전체 반영.

## 2026-07-25

* **Initialization**: akbun-shadowing-player 지식 번들 생성.
* **Creation**: [재생은 HTMLAudioElement, 파형은 Web Audio로 분리](decisions/2026-07-html-audio-plus-webaudio-split.md) 결정 기록.
* **Creation**: [순수 tsc + script 렌더러 패턴 재사용, module은 es2022](decisions/2026-07-plain-tsc-script-renderer.md) 결정 기록.
* **Creation**: [파형은 256샘플 블록 min/max를 사전 계산해 그린다](decisions/2026-07-peak-pyramid-waveform.md) 결정 기록.
* **Creation**: [macOS 전용 무서명 dmg로 배포](decisions/2026-07-macos-only-unsigned-dmg.md) 결정 기록.
