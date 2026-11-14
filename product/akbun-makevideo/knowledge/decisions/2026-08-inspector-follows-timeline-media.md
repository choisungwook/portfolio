---
type: Decision
title: Inspector는 타임라인에서 선택한 대상의 속성만 표시한다
description: 연결된 clip의 Video와 Audio 속성을 분리하고, 선택한 대상이 가진 묶음만 tab으로 만드는 결정.
tags: [makevideo, inspector, timeline, selection]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-14T00:00:00Z }
---

## 결정

- Inspector는 별도 드롭 대상이 아니라 타임라인 clip 선택을 자동 반영
- 연결된 영상과 오디오는 Video와 Audio tab으로 속성을 분리
- 선택한 track 종류와 같은 tab을 먼저 표시
- 영상에 내장 오디오만 있고 연결된 audio clip이 없으면 영상 clip을 Audio 속성 대상으로 사용
- tab은 선택한 대상이 가진 묶음만 만듦(Video, Audio, Transition). 묶음이 하나뿐이면 tab bar를 숨김 (0.51.0)
- 패널 제목은 선택한 대상의 종류(Video clip, Audio clip, Text 등)
- Effects, Image, File tab은 삭제 (0.51.0)

## 이유

- Inspector에 미디어를 다시 드롭하면 타임라인 선택과 편집 대상이 서로 달라질 수 있음
- opacity와 volume을 한 화면에 두면 연결된 clip 중 어느 속성을 바꾸는지 구분하기 어려움
- video-only 배치에서도 원본 영상의 내장 오디오 volume은 조절할 수 있어야 함
- tab 6개를 늘 표시하면 audio clip을 선택해도 Video tab이 남아, 속성이 없는 빈 화면으로 들어갈 수 있었음. 선택이 가진 묶음만 표시하면 그 경로가 없어짐
- Effects, Image, File tab은 편집할 속성 없이 asset 이름만 표시했음. 속성이 생기면 `inspector.js`의 `availableTabs`에 묶음을 더함
