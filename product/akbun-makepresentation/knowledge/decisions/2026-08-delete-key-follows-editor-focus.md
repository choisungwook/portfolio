---
type: Decision
title: 삭제 단축키의 대상은 편집 영역 포커스로 결정
description: 편집 영역에 포커스가 있으면 도형을, 그 밖에서는 현재 슬라이드를 삭제.
tags: [desktop, editor, focus, keyboard]
timestamp: 2026-08-15T17:40:00Z
---

## 결정

- stage 또는 속성 패널에 포커스가 있으면 선택 도형 삭제.
- 편집 영역에 포커스가 없으면 현재 슬라이드 삭제.
- 입력 필드와 텍스트 편집기는 Backspace 기본 동작 유지.
- 캔버스 pointerdown에서 캔버스에 명시적으로 포커스 부여.

## 이유

- 썸네일은 전체 렌더링 때 교체되므로 개별 DOM 포커스만으로 편집 의도 판별 불가.
- 캔버스 pointerdown의 preventDefault가 브라우저 기본 포커스 이동도 차단.
- 편집 영역이 삭제 대상을 소유하면 선택 도형과 슬라이드가 동시에 반응하지 않음.
