---
type: Decision
title: native monitor는 window overlay에서 AppKit 좌표 변환을 사용한다
description: Metal view를 WebKit 내부가 아닌 window content view에 두고 WKWebView 좌표를 AppKit API로 변환하는 결정.
tags: [makevideo, viewport, macos, appkit, gpu]
timestamp: 2026-08-12T00:00:00Z
---

# native monitor는 window overlay에서 AppKit 좌표 변환을 사용한다

## 결정

* Metal container를 WKWebView 하위가 아닌 window content view의 sibling overlay로 배치
* `getBoundingClientRect()` 결과는 CSS point 단위로 유지
* `convertRect:toView:`로 WKWebView 좌표를 overlay 좌표로 변환
* native 배치 IPC는 직렬화하고 대기 중인 좌표는 최신 값만 유지
* `devicePixelRatio`는 배율 변경 신호로만 사용하고 backing size는 AppKit view에서 조회

## 이유

* WebKit 내부에 Metal layer를 넣으면 WebKit compositing layer와 native layer의 좌표·clip 수명이 결합됨
* `bounds.origin` 한 값을 보정해도 title bar, flipped axis, ancestor transform을 모두 설명하지 못함
* AppKit view conversion은 실제 view hierarchy를 기준으로 전체 변환을 한 번에 적용
* CPU preview와 GPU preview는 모두 project 비율을 유지하며 GPU 차이는 영상 비율이 아닌 native surface 배치 문제였음

## 대체안

* `translateZ(0)`과 `z-index`는 별도 native Metal view의 좌표를 수정하지 못해 제외
* CSS 좌표에 `devicePixelRatio`를 곱하는 방식은 point와 physical pixel을 혼합하므로 제외
* WKWebView `bounds.origin` 수동 보정만으로 고정하는 방식은 WebKit hierarchy 변화에 취약해 제외
