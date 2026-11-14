---
type: Decision
title: 열린 덱은 경계에서 검증
description: 파일에서 온 색과 enum 문자열은 리더에서 한 번, 페이지가 덱을 받을 때 한 번 더 검증한다.
tags: [pptx, security, rust, svg]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

- Rust 리더는 색 속성을 정확히 6자리 hex일 때만 `#rrggbb`로 바꿈. 아니면 색이 없는 것으로 취급. 테마 색 맵과 코드 블록 descr의 Shape JSON 색도 같은 규칙.
- 페이지는 파일을 열 때 `sanitizeDeck`으로 도형의 `stroke`·`fill`·`textColor`, 슬라이드의 `background`와 enum 문자열(`dash`, 정렬, 화살표 끝)을 기본값으로 되돌림. 색 검증은 붙여넣기와 같은 `safeColor`.
- 붙여넣기, 프리셋, AI 패치는 이미 `parseClipboardShapes`를 거치므로 추가 작업 없음.

## 이유

- SVG 빌더가 이 값들을 속성에 그대로 끼워 넣고 결과를 innerHTML로 넣음. CSP가 인라인 핸들러를 막고 있어도 방어가 CSP 하나여서는 안 됨.
- 리더만 믿으면 descr에 담긴 Shape JSON처럼 리더를 지나지 않는 경로가 남고, 페이지만 믿으면 다른 호출자가 같은 덱을 받을 수 있음. 두 경계 모두에서 막는 비용이 작아 둘 다 둠.
