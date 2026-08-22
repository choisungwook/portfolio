---
type: Decision
title: monitor는 패널을 채우고 source monitor는 에셋 비율로 맞춘다
description: stage 여백을 없애고 source monitor의 fit 기준을 프로젝트에서 에셋으로 바꾸고 두 monitor가 subgrid로 같은 행을 쓰게 한 결정.
tags: [makevideo, preview, layout, css]
timestamp: 2026-08-22T00:00:00Z
---

# monitor는 패널을 채우고 source monitor는 에셋 비율로 맞춘다

## 결정

* `STAGE_PADDING`은 0. monitor의 그림과 패널 사이에 남는 것은 비율이 요구하는 레터박스뿐임
* source monitor의 stage는 asset 모드에서 프로젝트 해상도가 아니라 선택한 에셋 자신의 해상도로 fit. timeline 모드는 그대로 프로젝트 canvas
* Source와 Program 두 panel이 `#monitor-workspace`의 행을 `grid-template-rows: subgrid`로 공유하고, Program transport가 chrome 두 행을 차지

## 이유

* 그림이 패널의 90% 근처까지 줄어든 원인이 셋이었음. 14px 여백, 비율 레터박스, 그리고 source monitor에서 프로젝트 비율 stage와 `object-fit: contain`이 겹친 이중 레터박스
* source monitor가 보여 주는 것은 프로젝트 canvas가 아니라 파일 자신임. 프로젝트 비율로 먼저 줄이면 4:3 클립이 16:9 프로젝트에서 두 번 줄어듦
* chrome 행 수가 달라(Source 2행, Program 1행) 각 panel이 자기 여유를 따로 계산했고, 그래서 두 그림의 시작과 끝 행이 어긋났음. subgrid는 그 계산이 둘로 갈라지는 구조 자체를 없앰
* subgrid를 모르는 WebView는 두 선언을 버리고 per-panel 행으로 되돌아감. 예전 레이아웃이지 깨진 레이아웃이 아님

남는 trade off 하나. 에셋 비율이 프로젝트 비율과 다르면 두 monitor의 박스는 같아도 안쪽 레터박스가 달라 그림의 끝 행이 어긋남. [첫 영상이 canvas 비율을 정하는 규칙](./2026-08-first-video-defines-default-canvas-shape.md) 덕에 보통은 같음.

## Citations

1. [preview 배치는 한 곳에서 계산하고 point 단위로 넘긴다](./2026-08-one-geometry-in-points-for-the-monitor.md)
