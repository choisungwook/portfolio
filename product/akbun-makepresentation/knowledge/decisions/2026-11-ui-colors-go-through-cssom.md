---
type: Decision
title: 화면 색은 inline style 속성이 아니라 CSSOM으로 칠한다
description: 앱 CSP가 style-src 'self'라 HTML의 style 속성은 앱에서만 무시되므로, 데이터로 정해지는 색은 JS의 element.style로 넣는다.
tags: [csp, tauri, ui]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

- 배경 프리셋 스와치의 색은 `data-bg`에만 두고, 시작할 때 `element.style.backgroundColor`로 칠함. `index.html`에 `style="..."` 속성을 쓰지 않음.
- 고정된 장식(커스텀 색 칸의 무지개 그라디언트)은 `style.css`에 둠.

## 이유

- `tauri.conf.json`의 CSP가 `style-src 'self'`라 마크업의 inline style 속성은 막힘. CSSOM 조작은 CSP 대상이 아님.
- 브라우저 미리보기(`python3 -m http.server`)에는 CSP가 없어 inline style이 정상으로 보임. 그래서 미리보기만으로는 이 차이를 못 잡고, 설치본에서 스와치가 전부 흰색으로 나온 뒤에야 드러났음.
- CSP에 `'unsafe-inline'`을 더하면 고칠 수 있지만, SVG를 innerHTML로 넣는 앱이라 CSP를 느슨하게 하는 대신 마크업 쪽을 맞춤. 관련: [열린 덱은 경계에서 검증](2026-11-opened-decks-are-validated-at-the-boundary.md)
