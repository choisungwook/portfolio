---
type: Decision
title: PIP와 디졸브는 기존 compositor placement로 합성한다
description: PIP는 VisualItem, 디졸브는 clip 경계 객체로 저장하고 둘 다 FrameSource placement로 변환한다.
tags: [makevideo, pip, transition, compositor]
timestamp: 2026-09-05T00:00:00Z
---

# PIP와 디졸브는 기존 compositor placement로 합성한다

## 결정

* PIP는 `VisualItem.VideoOverlay`로 저장함
* crop은 해상도와 독립적인 정규화 좌표로 저장함
* 디졸브는 인접한 두 clip을 가리키는 별도 경계 객체로 저장함
* 디졸브 구간에만 incoming decoder placement를 추가함
* incoming source handle이 부족하면 첫 프레임을 유지함
* preview와 export는 같은 placement와 opacity 계산을 사용함
* 동시 video source가 측정 기준 4개를 넘으면 경고하되 편집은 허용함

## 이유

* clip 비중첩 규칙을 유지함
* 기존 transform, z-order, undo, audio 배치 경로를 재사용함
* 실시간 제한이 내보내기 기능 제한으로 번지지 않음
