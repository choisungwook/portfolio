# Decisions

akbun-shadowing-player 작업 중 내린 의사결정과 이유다.

* [재생은 HTMLAudioElement, 파형은 Web Audio로 분리](2026-07-html-audio-plus-webaudio-split.md)
* [순수 tsc + script 렌더러 패턴 재사용, module은 es2022](2026-07-plain-tsc-script-renderer.md)
* [파형은 256샘플 블록 min/max를 사전 계산해 그린다](2026-07-peak-pyramid-waveform.md)
* [macOS 전용 무서명 dmg로 배포](2026-07-macos-only-unsigned-dmg.md)
* [릴리스 버전은 tag에서 마이너 +1로 자동 계산](2026-07-release-tag-auto-minor-bump.md)
* [로그는 macOS 관례 위치에 자체 rotation 로거로 기록](2026-07-file-logger-macos-logs-dir.md)
* [업데이트는 dmg를 직접 받아 앱 번들을 교체한다](2026-07-update-download-and-swap.md)
* [테마는 CSS 변수와 light-dark()로 두되 canvas 색만 예외로 둔다](2026-07-theme-css-vars-canvas-exception.md)
