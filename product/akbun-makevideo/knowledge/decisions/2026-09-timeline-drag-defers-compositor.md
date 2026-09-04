---
type: Decision
title: 타임라인 드래그 중 compositor 상태 전환을 미룬다
description: clip pointer-down은 선택만 바꾸고 exact frame 재합성과 레인 배치 읽기는 드래그 시작 경로에서 제외한다.
tags: [makevideo, timeline, drag, diagnostics]
timestamp: 2026-09-04T00:00:00Z
---

# 타임라인 드래그 중 compositor 상태 전환을 미룬다

## 결정

* clip drag가 시작되면 visual editor overlay 해제를 pointer-up까지 유예
* 대상 레인은 pointer-down에서 측정한 세로 경계와 pointer 좌표로 판정
* pointer-down 다음 frame과 첫 pointermove queue 지연을 Debug 패널에 last와 peak로 표시

## 이유

* overlay 해제는 exact frame 재합성을 요청해 첫 pointermove보다 비싼 작업이 먼저 실행될 수 있음
* elementFromPoint는 매 pointermove에서 브라우저 배치 계산을 강제할 수 있음
* 간헐적인 입력 지연은 화면 관찰보다 같은 경로의 수치로 회귀 여부를 판정해야 함
