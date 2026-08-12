---
type: Decision
title: CSS viewport 원점은 native bounds origin에서 시작한다
description: getBoundingClientRect 좌표를 native subview frame으로 옮길 때 NSView bounds의 크기뿐 아니라 origin도 반영하기로 한 결정.
tags: [makevideo, viewport, macos, appkit]
timestamp: 2026-08-12T00:00:00Z
---

# CSS viewport 원점은 native bounds origin에서 시작한다

## 결정

* CSS viewport 좌표는 WKWebView frame의 0이 아니라 visible bounds의 origin을 기준으로 native frame에 더함
* flipped 여부와 bounds origin을 함께 적용하고 x와 y 모두 같은 규칙 사용

## 이유

* `getBoundingClientRect()`는 보이는 viewport의 좌상단을 0으로 반환하지만 NSView subview frame은 superview bounds 좌표계에 놓임
* bounds origin을 0으로 가정하면 native surface만 page preview보다 위로 이동하며, 크기와 비율이 같아도 서로 다른 자리에 표시됨

## Citations

1. [native view 좌표는 superview에게 원점을 물어본다](./2026-08-native-view-asks-its-superview-for-the-origin.md)
