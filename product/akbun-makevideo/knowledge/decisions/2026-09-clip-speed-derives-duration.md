---
type: Decision
title: clip 속도는 source 범위를 바꾸지 않고 timeline 길이를 결정한다
description: clip의 in-out은 유지하고 timeline duration을 source span과 speed에서 계산한다.
tags: [makevideo, timeline, audio, render]
timestamp: 2026-09-05T00:00:00Z
---

# clip 속도는 source 범위를 바꾸지 않고 timeline 길이를 결정한다

## 결정

* `in`과 `out`은 source 범위로 유지함
* timeline 길이는 `(out - in) / speed`를 project frame으로 반올림해 계산함
* pitch 보존은 기본값으로 켜고 fade는 keyframe과 별도 edge-relative 값으로 저장함

## 이유

* speed 변경 뒤에도 source trim 의미가 바뀌지 않음
* preview, seek, split, render가 같은 duration과 source 위치를 계산함
* fade를 keyframe으로 변환하지 않아 clip 길이가 바뀌어도 edge 기준 의도가 유지됨
