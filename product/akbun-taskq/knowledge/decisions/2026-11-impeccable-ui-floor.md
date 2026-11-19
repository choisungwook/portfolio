---
type: Decision
title: The UI follows impeccable's craft floor for product surfaces
description: Checked against pbakaus/impeccable (Operate mode, craft floor, audit); one SVG icon set, no side stripes, AA contrast and themed browser surfaces became rules.
tags: [ui, design-system, accessibility]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-19T15:00:00Z }
sources:
  - id: impeccable
    resource: https://github.com/pbakaus/impeccable
    title: impeccable, design vocabulary and detector for coding agents (Apache-2.0)
---

## 결정

- taskq 화면은 impeccable의 Operate 모드(작업 도구)와 craft floor를 품질 하한으로 삼는다[^impeccable].
- 아이콘은 `ui/js/core/icons.js`의 SVG 선 아이콘 한 벌만 쓴다. 유니코드 글리프(⚙ ↻ ☰ ◷ 등)를 아이콘으로 쓰지 않는다.
- 상태는 둥근 상자 한쪽의 색 줄무늬로 표시하지 않는다. 상태 색을 섞은 1px 전체 테두리와 배경 tint를 쓴다.
- 본문 텍스트 대비는 4.5:1 이상이다. 색 면 위 상태 글자는 상태 색 대신 `--fg`로 쓰고 테두리로 상태를 보인다.
- 텍스트 선택, caret, 스크롤바, `accent-color`, 표와 시각의 숫자 폭은 테마 토큰을 따른다.

## 이유

- impeccable CLI(detector)는 이 환경에서 실행 권한이 없어 규칙 문서만 읽고, Playwright로 화면 8개와 bot 대화, 설정을 dark·light 두 테마에서 훑어 대비, 터치 영역, 한쪽 줄무늬, 글리프 아이콘을 쟀다.
- 측정에서 걸린 항목: 알림 숫자 2.7:1, 선택한 bot 줄 시각 3.5:1, 상태 칩 4.2:1, queue 아바타 3.5:1, 한쪽 줄무늬 9곳, 버튼과 메뉴의 글리프 아이콘 14곳. 고친 뒤 대비·줄무늬는 0건이고, 사전 리뷰가 찾은 나머지 글리프 버튼(알림 닫기, bot 추가, 접근 skill 추가·삭제, 워크플로 확대·축소·맞춤)도 SVG로 바꿨다.
- 글리프는 글꼴마다 굵기와 기준선이 달라 Astryx 토큰을 적용한 뒤 아이콘끼리 크기가 맞지 않았다. SVG 한 벌이면 선 두께와 크기가 같다.

## 잃는 것

- 캘린더 블록 높이(16px)와 본문 안 링크 버튼(22px)은 24px 터치 영역에 못 미친다. 블록 높이는 실행 시간을 나타내는 데이터이고 링크는 inline 예외라 그대로 두었다.
- bot 아바타의 SDK 표시(✻ ◎ K)와 워크플로 단계 종류 표시(▶ ✓ ⇄ ✋)는 버튼이 아닌 표식이라 글자로 남겼다.
- `prefers-reduced-motion`은 모든 전환을 끄는 방식 그대로다. impeccable은 상태 변화를 남기는 대안을 권하지만 이번 범위에서 다루지 않았다.
