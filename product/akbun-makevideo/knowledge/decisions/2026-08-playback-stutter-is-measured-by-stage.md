---
type: Decision
title: 재생 끊김은 경로별 계측으로 원인을 분리
description: native playback의 공급 부족, 재동기화, 표시 지연, A/V 지연을 별도 수치로 본다.
tags: [makevideo, playback, diagnostics]
timestamp: 2026-08-09T00:00:00Z
---

# 재생 끊김은 경로별 계측으로 원인을 분리

## 결정

* native monitor 상태에 frame-source starvation, 재동기화, 표시 실패, 표시 호출 시간, A/V 지연 기록
* Debug 패널에서 1초 간격으로 집계값 표시
* 화면 끊김만으로 WGPU·proxy 구조 교체 판단 금지

## 이유

* WGPU surface 경로에서는 프레임이 WebView IPC를 통과하지 않음
* starvation 증가는 디코드·큐 공급 문제를 가리킴
* 표시 호출 또는 A/V 지연 증가는 surface·GPU·스케줄 문제를 가리킴
