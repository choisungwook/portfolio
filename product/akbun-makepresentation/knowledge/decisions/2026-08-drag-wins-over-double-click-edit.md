---
type: Decision
title: 드래그는 더블클릭 편집보다 우선
description: 두 번째 누름이 이동되면 객체 드래그로 처리하고 이동이 없을 때만 편집 진입.
tags: [desktop, editor, pointer, drag]
timestamp: 2026-08-16T09:15:00Z
---

## 결정

- 두 번째 pointerdown은 편집 후보로만 저장.
- pointermove가 발생하면 객체 이동 우선.
- 이동 없는 pointerup에서만 텍스트 또는 코드 편집 진입.
- 선택된 빈 도형 내부는 다른 도형을 가리지 않을 때 이동 영역으로 사용.

## 이유

- pointerdown 즉시 편집하면 선택 직후 드래그도 더블클릭으로 오인.
- 채움 없는 사각형과 원은 내부에 SVG hit target이 없어 선택 후에도 테두리에서만 이동 가능.
- 실제 도형 hit를 먼저 사용하면 선택 도형 내부의 다른 객체 선택 유지.
