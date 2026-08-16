---
type: Decision
title: 브라우저 편집기 파일은 변경 이유별로 분리
description: 공개 API와 실행 순서를 유지하면서 편집 모델과 화면 제어 코드를 기능별 파일로 분리.
tags: [desktop, editor, javascript, architecture]
timestamp: 2026-08-16T00:00:00Z
---

## 결정

- 순수 편집 로직을 `src/editor/` 아래 모델, 기하, 덱, 프리셋, SVG 단위로 분리.
- `editor.js`는 기존 `slidesLib` 공개 API를 조립하는 facade로 유지.
- 화면 제어 로직을 `src/renderer/` 아래 렌더링, 입력, 다이얼로그, 파일, 발표 단위로 분리.
- `renderer.js`는 메뉴, AI 연결, 초기화를 담당.
- 번들러를 추가하지 않고 `index.html`의 스크립트 순서로 의존 관계를 표현.
- renderer 기능 파일은 기존 페이지 스코프를 공유해 상태 구조와 이벤트 흐름 유지.

## 이유

- 기능 수정 시 관련 파일만 읽어 탐색 시간과 AI 컨텍스트 사용량 절감.
- 기존 공개 API와 테스트 진입점을 유지해 레이아웃 변경이 기능 변경으로 번지는 것을 방지.
- 상태 캡슐화까지 동시에 바꾸면 회귀 범위가 커지므로 별도 리팩터링 대상으로 분리.
