---
type: Decision
title: 첫 영상은 빈 기본 프로젝트의 canvas 비율을 정한다
description: 첫 영상 clip이 기본 해상도 프로젝트의 비율을 정하되 긴 변 해상도는 유지하는 결정.
tags: [makevideo, preview, aspect-ratio, timeline]
timestamp: 2026-08-10T00:00:00Z
---

# 첫 영상은 빈 기본 프로젝트의 canvas 비율을 정한다

## 결정

* 빈 기본 프로젝트의 video track에 첫 영상을 놓으면 영상 비율에 맞춰 project width와 height를 변경
* 기본 프로젝트의 긴 변 해상도와 frame rate는 유지
* clip이나 visual item이 있거나 해상도를 직접 바꾼 프로젝트는 유지

## 이유

* 9:16 영상을 기본 16:9 canvas에 넣으면 contain 결과가 preview 중앙의 좁은 영역으로 축소되어 영상이 없는 것처럼 보임
* 원본 2160×3840을 그대로 채택하면 FHD 기본 프로젝트가 의도하지 않게 4K로 커지므로 비율만 채택
