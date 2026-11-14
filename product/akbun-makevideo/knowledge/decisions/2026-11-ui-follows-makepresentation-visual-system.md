---
type: Decision
title: 화면 token은 akbun-makepresentation과 같은 이름과 값을 쓴다
description: 0.51.0에서 색·모양 token을 makepresentation 0.30.1의 설정으로 맞추고, 영상 편집기에만 있는 clip 선택색과 monitor 배경은 따로 둔 결정.
tags: [ui, design-tokens, css]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-14T00:00:00Z }
sources:
  - id: discussion-1466
    resource: https://github.com/choisungwook/portfolio/discussions/1466
    title: akbun-makepresentation 디자인 설정 (0.30.1 기준)
---

## 결정

- `workspace/src/style.css`의 `:root`는 makepresentation과 같은 이름(`--muted`, `--panel-soft`, `--on-accent`, `--control`, `--chip`, `--hover`)과 같은 값을 씀.[^discussion-1466] 현재 값과 배치 규칙은 [designs/README.md](../../designs/README.md)의 Visual system 절에 있음.
- `--stage`는 makepresentation과 같은 뜻(편집 대상 주변의 띠, 여기서는 timeline toolbar와 lane)으로 쓰고, monitor의 검은 배경은 `--monitor`로 분리함.
- clip 선택과 playhead는 `--accent`가 아니라 `--select`(주황)를 유지함.
- keyboard focus는 `--accent-soft` ring이 아니라 `--accent` 2px outline을 유지함.
- hover는 `--control` 채움을 바꾸지 않고 `background-image`로 `--hover`를 한 겹 얹음.

## 이유

- 두 앱의 token 이름이 같으면 한쪽에서 고친 control 패턴을 다른 쪽에 이름을 바꾸지 않고 옮길 수 있음.
- video clip의 채움과 테두리가 파란 계열(`--clip-video`, `--clip-video-edge`)이라 `--accent` 윤곽은 선택된 clip과 선택되지 않은 clip을 구분하지 못함. makepresentation의 "선택은 강조색" 규칙을 clip에는 적용하지 않은 이유임.
- `--accent-soft`는 dark에서 `--panel`과 명도 차이가 작아 focus 위치를 알리기 어려움.
- `--control`(alpha .05)과 `--hover`(alpha .06)는 값이 거의 같아 채움을 교체하면 hover가 눈에 띄지 않음. 겹쳐야 차이가 생김.
- monitor 위의 hint와 mode badge는 영상 위에 그리므로 앱 테마 token을 쓰지 않고 고정색을 씀. makepresentation에서 슬라이드가 앱 테마를 따르지 않는 것과 같은 판단임.
