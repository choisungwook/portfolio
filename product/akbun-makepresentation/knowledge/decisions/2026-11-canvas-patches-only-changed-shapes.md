---
type: Decision
title: 캔버스는 바뀐 도형만 고쳐 그리고 이동 중에는 프레임당 한 번 그림
description: 도형·오버레이 레이어를 DOM에 유지하고 키가 바뀐 도형만 갱신하며, pointermove 렌더는 프레임당 한 번으로 합침.
tags: [performance, svg, canvas, rendering]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

- `#canvas`는 영속 그룹 셋 `#layer-under`(선 halo), `#layer-shapes`(도형마다 `g[data-i]`), `#layer-over`(나머지 오버레이)를 둠. 없으면 `renderCanvas`가 다시 만듦.
- 아래·위 레이어는 마지막으로 넣은 문자열과 다를 때만 `innerHTML`을 바꿈.
- 도형은 도형별 키가 바뀐 `g`만 다시 그림. 개수가 다르면 레이어 전체를 다시 만듦.
- 선택(`sel`)과 잠금(`data-locked`)은 도형 마크업에 넣지 않고 매 렌더마다 `g`에 토글. 도형 마크업은 도형 자신, `hideText`, 화면 배율에만 의존.
- 키는 도형 JSON에서 이미지 `src`를 길이와 앞뒤 32자로 요약한 값. 길이와 양쪽 끝이 같은 서로 다른 그림은 구분 못 하는 한계가 있고, 그림을 넣을 때 `src`를 한 번 해시하면 해소됨.
- pointermove는 모델만 즉시 고치고 `scheduleCanvasRender`로 프레임당 한 번 그림. `renderCanvas`가 대기 중인 프레임을 취소하므로 pointerup 등 직접 호출은 그대로 동기.
- 썸네일은 위치별로 요소를 유지하고 슬라이드 키가 바뀐 svg만 교체.

## 이유

- 도형 1개 이동, 영역 선택, 선택 토글 모두 이미지 6장(각 약 1.2MB)과 도형 66개 슬라이드에서 한 번 그리는 데 약 19.6ms(p95 약 23ms)가 걸렸고 `renderThumbs`는 슬라이드 12장에서 243ms. 매번 모든 data URI를 다시 파싱·디코드했기 때문.
- 같은 덱에서 고친 뒤 세 경우가 중앙값 0.4ms, 썸네일이 1.1ms. 강제 레이아웃까지의 동기 시간이라 디코드와 페인트는 측정에 포함되지 않음.
- 선택을 마크업에 넣으면 선택이 바뀔 때마다 도형이 다시 만들어져 이득이 사라지므로 클래스 토글로 분리.
- 수MB 문자열 비교를 피하려고 요약 키를 썼고, 한계는 코드 주석에 남김.

관련: [슬라이드의 배열 순서가 곧 z 순서다](2026-09-array-order-is-z-order.md)
