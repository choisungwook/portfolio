---
type: Decision
title: preview 배치는 한 곳에서 계산하고 point 단위로 넘긴다
description: page가 devicePixelRatio를 곱하고 Rust가 backing scale로 나누던 왕복과 크기 변화만 감지하던 ResizeObserver를 없애고, geometry.js 하나에서 계산해 point로 넘기기로 한 결정.
tags: [makevideo, viewport, preview, macos, appkit]
timestamp: 2026-08-11T00:00:00Z
---

# preview 배치는 한 곳에서 계산하고 point 단위로 넘긴다

## 결정

* stage box 계산은 `src/geometry.js` 한 곳에 두고, media element preview와 native monitor가 같은 입력(panel box + project 해상도)으로 각자 호출. 한쪽이 다른 쪽이 그려 놓은 결과를 재측정하지 않음
* IPC로 넘기는 좌표 단위는 physical pixel이 아니라 point(CSS pixel). swapchain에 필요한 physical size는 view가 `convertRectToBacking`으로 직접 답함
* 배치 갱신은 stage의 ResizeObserver가 아니라 monitor가 이미 돌리는 animation frame에서 매 프레임 재측정. 보낼지 여부는 `samePlace` 비교가 정함
* 맞출 자리가 없는 panel은 최소 크기가 아니라 빈 box로 답하고, native view는 숨김

## 이유

* page가 `devicePixelRatio`를 곱하고 Rust가 backing scale로 나누던 두 변환은 서로 상쇄되는 왕복이었음. 두 값이 어긋나는 순간(다른 scale factor의 display로 창을 옮긴 뒤 box 크기는 그대로라 재전송이 없을 때) 좌표와 크기가 한꺼번에 배로 틀어져 monitor가 panel 밖에 그려짐
* ResizeObserver는 크기에만 반응함. 옆 panel이 넓어지거나 inspector가 열려 stage가 크기 그대로 이동하면 native view는 이전 자리에 남는데, webview 위에 있는 native view는 page의 `overflow: hidden`으로 잘리지 않아 timeline 위를 덮음. 움직이는 이유를 나열해 관찰자를 붙이는 방식은 목록이 끝나지 않음
* `Math.max(80, ...)`처럼 폭과 높이에 각각 걸린 최소값은 작은 panel에서 비율을 깨뜨리고 box를 panel보다 크게 만들었음. 두 증상(비율이 안 맞음, preview를 벗어남)이 같은 한 줄에서 나옴

## Citations

1. [native view 좌표는 superview에게 원점을 물어본다](./2026-08-native-view-asks-its-superview-for-the-origin.md)
