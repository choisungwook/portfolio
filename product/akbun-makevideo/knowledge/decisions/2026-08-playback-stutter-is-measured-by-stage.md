---
type: Decision
title: 재생 끊김은 경로별 계측으로 원인을 분리
description: native playback의 공급 부족, 재동기화, 표시 지연, A/V 지연을 별도 수치로 본다.
tags: [makevideo, playback, diagnostics]
timestamp: 2026-08-09T00:00:00Z
---

# 재생 끊김은 경로별 계측으로 원인을 분리

## 결정

* native monitor 상태에 starvation, 재동기화, 표시 실패, 표시 호출 시간, A/V 지연을 따로 기록하고 Debug 패널에 표시
* 화면 끊김만으로 WGPU나 proxy 구조 교체 판단 금지

## 이유

* WGPU surface 경로는 프레임이 WebView IPC를 통과하지 않으므로, 예전 경로의 감각으로 원인을 짐작할 수 없음
* starvation은 공급, 표시 호출과 A/V 지연은 surface와 스케줄을 가리켜 수치가 곧 범인을 나눔

## 결과

실제 원인은 exact frame이 monitor와 같은 wgpu device를 잡고 블로킹한 것이었고, 구조 교체 없이 제출 인덱스 대기와 blocking thread 이동으로 끝남. [그래픽 장치 축 정리](2026-08-one-axis-for-the-graphics-device.md)가 그 뒤에 남은 조합을 줄임.
