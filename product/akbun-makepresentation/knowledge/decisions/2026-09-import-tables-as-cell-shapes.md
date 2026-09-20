---
type: Decision
title: PPTX 표는 셀별 도형으로 가져온다
description: 표 모델이 없는 편집기에서는 DrawingML 표의 각 셀을 편집 가능한 사각형으로 변환한다.
tags: [pptx, import, table, editor]
timestamp: 2026-09-20T00:00:00Z
---

## 결정

- PPTX의 `graphicFrame` 표를 읽어 각 셀의 위치, 크기, 채우기, 테두리, 텍스트를 독립된 사각형으로 변환한다.
- 저장할 때는 이 사각형들을 일반 PPTX 도형으로 내보낸다.

## 이유

- 기존 편집 모델에 표 객체가 없어 `graphicFrame`을 버리면 표 전체가 사라진다.
- 셀별 도형은 현재 편집기에서 바로 선택하고 내용을 바꿀 수 있다.
- 행·열 삽입이나 병합 같은 표 전용 편집 기능은 제공하지 않는다.
