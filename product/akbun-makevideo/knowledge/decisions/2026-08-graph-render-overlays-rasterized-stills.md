---
type: Decision
title: filter graph 렌더는 정적 visual만 rasterize한 still로 굽는다
description: 정적 text/shape는 자체 raster를 overlay하고 video paint는 프레임 합성 경로로 보내는 결정.
tags: [makevideo, render, ffmpeg, text, paint]
timestamp: 2026-08-10T00:00:00Z
---

# filter graph 렌더는 정적 visual만 rasterize한 still로 굽는다

## 결정

* 정적 text/shape는 rasterizer가 item당 still 하나(PAM)를 출력 해상도로 만들고, filter graph가 overlay와 enable 구간으로 굽는다
* video paint가 하나라도 있으면 CPU 설정도 프레임 합성 경로를 사용하고 filter graph fallback을 만들지 않음
* video paint는 visual item과 fill layer마다 장기 decoder 하나를 두고 순차 프레임에서 재사용하며 seek에서만 재시작
* drawtext 필터 생성과 전체 소프트웨어 합성은 둘 다 선택하지 않음

## 이유

* filter graph 경로(compositor cpu 설정, composited 렌더 실패 폴백)는 drawtext가 없어 preview에 보이던 레이어가 결과 파일에서 조용히 사라졌음
* drawtext는 폰트 지정과 도형 표현이 rasterizer와 달라 preview와 렌더가 다른 그림이 됨. 정적 still overlay는 픽셀은 compositor 것, 합성 속도는 ffmpeg 것으로 유지함
* video paint를 still로 넘기면 첫 프레임으로 굳은 잘못된 결과가 성공함. 이 경우는 느린 CPU 합성도 허용하고 잘못된 fallback은 금지하는 편이 안전함
* 프레임마다 ffmpeg 프로세스를 만들면 재생과 렌더가 process spawn 비용에 묶임. decoder 수를 여덟 개로 제한해 자원 상한도 유지함

## Citations

1. <https://github.com/choisungwook/portfolio/pull/851>
