---
type: Decision
title: native view 좌표는 superview에게 원점을 물어본다
description: WKWebView는 flipped view라 bottom-left 가정이 monitor를 세로로 뒤집힌 위치에 놓았고, isFlipped 분기로 고친 결정.
tags: [makevideo, viewport, macos, appkit]
timestamp: 2026-08-10T00:00:00Z
---

# native view 좌표는 superview에게 원점을 물어본다

## 결정

* viewport 좌표 변환은 AppKit의 bottom-left를 가정하지 않고 superview의 isFlipped를 물어 원점을 정함
* child view의 frame 계산은 container를 window에 넣은 뒤에 수행. window 밖 view의 convertRectToBacking은 그 window의 display scale을 모름

## 이유

* PR #853이 native container를 window contentView(bottom-left)에서 WKWebView 안으로 옮겼는데, WKWebView는 isFlipped가 YES인 top-left 원점 view라 기존 y flip이 이중 적용되어 monitor가 stage의 세로 거울상 위치에 붙음
* NSView 계열은 서브클래스마다 원점이 다르므로, 부모를 바꾸는 변경은 좌표 가정을 함께 검증해야 함. isFlipped 분기는 어느 부모 아래서도 같은 코드가 맞음

## Citations

1. <https://github.com/choisungwook/portfolio/pull/853>
