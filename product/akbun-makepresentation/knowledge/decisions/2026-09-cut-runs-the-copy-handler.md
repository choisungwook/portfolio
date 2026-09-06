---
type: Decision
title: 잘라내기는 복사 핸들러를 실행하고 지우는 순서로 만든다
description: 캔버스에는 cut 이벤트가 오지 않으므로 execCommand로 copy를 일으키고, 복사가 실제로 일어났을 때만 삭제한다.
tags: [desktop, editor, clipboard, javascript]
timestamp: 2026-09-06T00:00:00Z
---

## 결정

- Cmd+X는 keydown에서 `document.execCommand('copy')`를 부른 뒤 선택 객체를 지운다.
- copy 핸들러가 clipboardData를 채운 시각을 기록하고, 그 시각이 바뀌지 않으면 삭제하지 않는다.
- 폼 필드에 포커스가 있으면 keydown이 먼저 빠져나가므로 네이티브 잘라내기가 그대로 동작한다.

## 이유

- webview는 편집 가능한 선택에만 cut 이벤트를 보낸다. 캔버스는 편집 영역이 아니라 SVG이므로 Cmd+X가 아무 이벤트도 만들지 않았다.
- copy 이벤트는 편집 영역이 아니어도 오기 때문에 붙여넣기 규약(`application/x-akbun-makepresentation-shapes`)이 이미 그 핸들러 하나에 있다. 잘라내기가 같은 핸들러를 재사용하면 클립보드 형식이 한 곳에 남는다.
- 클립보드가 거절당한 webview에서 그냥 지우면 잘라내기가 붙여넣을 수 없는 삭제가 된다. 복사 성공 여부를 확인한 뒤 지우는 것이 이 손실을 막는 유일한 지점이다.

관련: [브라우저 편집기 파일은 변경 이유별로 분리](2026-08-browser-editor-files-follow-change-reasons.md)
