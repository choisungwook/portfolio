---
type: Decision
title: Program Monitor 전체 화면은 편집 레이아웃을 숨겨 보존한다
description: 앱 안의 Program Monitor 전체 화면은 레이아웃 상태를 바꾸지 않고 CSS 표시만 전환한다.
tags: [makevideo, program-monitor, layout]
timestamp: 2026-09-04T00:00:00Z
---

# Program Monitor 전체 화면은 편집 레이아웃을 숨겨 보존한다

## 결정

* Cmd+F로 Program Monitor만 앱 영역에 표시
* 기존 panel과 timeline은 제거하지 않고 CSS로 숨김
* Esc로 전체 화면 class만 제거해 직전 편집 레이아웃 복귀

## 이유

* panel 열림 상태와 timeline 위치를 다시 만들지 않아도 원래 작업 맥락이 그대로 복원됨
* 브라우저 Fullscreen API 없이 Tauri 창 안에서 같은 동작을 일관되게 제공 가능
