---
type: Decision
title: 인스펙터는 선택을 따르고 툴바는 도구만 둔다
description: 선택이 없으면 슬라이드 속성, 있으면 객체 속성과 객체 동작을 보여주고 툴바에는 도구만 남김.
tags: [editor, inspector, toolbar]
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

- 아무것도 선택하지 않으면 인스펙터는 Slide 섹션(배경)을 보여줌.
- 객체를 선택하면 헤더에 이름과 Duplicate·Lock/Unlock·Delete를 두고 그 아래에 속성 행을 표시.
- 툴바에는 도구와 보기 제어(Insert, 줌, 인스펙터 토글)만 두고 슬라이드 배경 버튼은 인스펙터로 이동.
- 인스펙터 표시 여부는 로컬 설정에 저장.

## 이유

- "오른쪽 패널은 선택한 것을 보여준다"는 규칙 하나로 설명되며, 비활성 기본값 행이 사라짐.
- 툴바 항목이 줄어 가운데 도구 캡슐이 좁은 창에서도 유지됨.
- 삭제를 긴 목록의 맨 아래가 아니라 객체 이름 옆에 두면 스크롤 없이 닿음.

관련: [텍스트 상자 높이는 글이 정한다](2026-09-text-boxes-are-as-tall-as-their-text.md)
