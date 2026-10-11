---
type: Decision
title: 발표자 노트는 PPTX notes page로 저장
description: 노트는 슬라이드의 평문 필드이고, 노트가 있는 슬라이드만 notes page와 전용 테마를 가진 notes master를 함께 쓴다.
tags: [pptx, ooxml, rust, presentation]
timestamp: 2026-09-28T00:00:00Z
---

## 결정

- 노트는 슬라이드의 평문 필드 notes. 줄 하나가 문단 하나.
- 노트가 있는 슬라이드만 notes page 생성. 하나도 없으면 notes master도 쓰지 않음.
- notes master는 슬라이드 master의 테마를 공유하지 않고 theme2 부품을 따로 가짐.
- 읽을 때는 notes page의 type=body placeholder 글만 가져옴. 서식은 버림.
- 발표 모드 화면에는 노트를 띄우지 않음. 발표자 창은 별도 작업.

## 이유

- PowerPoint와 Keynote가 읽는 위치가 notes page라서 다른 앱에서 연 파일에도 노트가 남음.
- 노트 없는 덱의 패키지를 이전과 같게 두면 기존 파일과 테스트가 바뀌지 않음.
- PowerPoint가 직접 저장한 파일도 notes master마다 별도 테마 부품을 둠. 검증된 구조를 그대로 따름.
- 한 화면 발표에서 노트를 띄우면 청중에게도 보임.

관련: [PPTX 표는 셀별 도형으로 가져온다](2026-09-import-tables-as-cell-shapes.md)
