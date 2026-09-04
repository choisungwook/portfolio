---
type: Decision
title: Source monitor의 in-out은 재생 경계다
description: asset preview의 seek와 재생을 선택 구간 안으로 제한하고 구간 밖은 scrub bar에서 어둡게 표시한다.
tags: [makevideo, source-monitor, playback]
timestamp: 2026-09-04T00:00:00Z
---

# Source monitor의 in-out은 재생 경계다

## 결정

* asset preview의 seek 범위를 in부터 out까지로 제한
* out 도달 시 in으로 되감지 않고 out에서 정지
* in-out이 없거나 전체 구간이면 자산 전체를 재생
* scrub bar의 선택 밖 구간을 어두운 음영으로 표시

## 이유

* 삽입 결과를 만들기 전에도 선택한 소스 구간을 그대로 확인할 수 있어야 함
* 표식만으로는 어느 쪽이 선택 안과 밖인지 구분하기 어려움
