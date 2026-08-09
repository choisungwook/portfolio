---
type: Decision
title: 그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다
description: compositor 설정을 GPU와 CPU 둘로 줄이고 playback 설정을 없앤다.
tags: [makevideo, settings, playback, compositor]
timestamp: 2026-08-09T00:00:00Z
---

# 그래픽 장치를 쓰는지 하나로 preview와 playback과 render를 함께 정한다

## 결정

* compositor 설정은 gpu와 cpu 둘뿐이며, exact frame과 playback engine과 render 경로를 함께 결정
* playback 설정(native/media-element) 삭제. gpu면 native monitor, cpu면 media element
* cpu의 render는 소프트웨어 합성이 아니라 ffmpeg filter graph
* 판정은 Rust의 stays_on_cpu와 page의 staysOnCpu 한 쌍만 사용. 옛 값 auto와 ffmpeg는 gpu로 읽음

## 이유

* native monitor가 graphics surface에 그리므로 cpu와 native는 사용자가 고를 수 있으나 얻을 수 없는 조합이었고, 조용히 폴백되어 고장으로 읽힘
* 전체 render를 소프트웨어 합성기로 돌리면 filter graph가 분 단위로 끝내는 일을 시간 단위로 함
* 설정 3 x 2에 불가능한 칸이 섞인 상태보다, 축 하나가 세 곳을 정하는 편이 설명과 검증 모두 짧음

## Citations

1. <https://github.com/choisungwook/portfolio/pull/851>
