---
type: Decision
title: filter graph 렌더는 rasterize한 still을 overlay로 굽는다
description: CPU 렌더와 폴백에서 text/shape가 조용히 빠지던 것을 drawtext도 소프트웨어 합성도 아닌 자체 raster + overlay로 해결한 결정.
tags: [makevideo, render, ffmpeg, text]
timestamp: 2026-08-10T00:00:00Z
---

# filter graph 렌더는 rasterize한 still을 overlay로 굽는다

## 결정

* compositor의 text/shape rasterizer가 item당 still 하나(PAM)를 출력 해상도로 만들고, filter graph가 overlay와 enable 구간으로 굽는다
* drawtext 필터 생성과 전체 소프트웨어 합성은 둘 다 선택하지 않음

## 이유

* filter graph 경로(compositor cpu 설정, composited 렌더 실패 폴백)는 drawtext가 없어 preview에 보이던 레이어가 결과 파일에서 조용히 사라졌음
* drawtext는 폰트 지정과 도형 표현이 rasterizer와 달라 preview와 렌더가 다른 그림이 되고, 전체 소프트웨어 합성은 filter graph가 분 단위로 끝내는 일을 시간 단위로 만들어 기존 결정([그래픽 장치 축](2026-08-one-axis-for-the-graphics-device.md))의 이유를 무너뜨림. still overlay는 픽셀은 compositor 것, 합성 속도는 ffmpeg 것

## Citations

1. <https://github.com/choisungwook/portfolio/pull/851>
