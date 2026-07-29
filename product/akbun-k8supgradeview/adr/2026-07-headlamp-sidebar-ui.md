---
type: Decision
title: 상단 탭 바를 headlamp 스타일 왼쪽 사이드메뉴로 바꾸고 테마를 CSS 변수로 옮긴다
description: 화면 전환 UI만 사이드바로 바꾸고, 색을 CSS 변수로 옮기면서 dark mode를 함께 지원한다. 기능과 renderer 로직은 그대로 둔다.
tags: [electron, kubernetes]
timestamp: 2026-07-29T00:00:00Z
---

## 결정

상단 헤더의 가로 탭 바를 headlamp처럼 왼쪽 고정 사이드바로 바꾼다. 메뉴마다 인라인 SVG 아이콘을 붙이고, 현재 메뉴는 왼쪽 강조선과 배경색으로 표시한다.

색은 전부 CSS 변수로 선언한다. light가 기본값이고 prefers-color-scheme: dark 미디어 쿼리가 덮는다. BrowserWindow에는 nativeTheme 기반 backgroundColor를 넣어 기동 시 흰 화면 깜빡임을 막는다.

기능은 추가하지 않는다. renderer.ts는 수정하지 않는다.

## 이유

- 탭이 여섯 개가 되면서 상단 가로 배치는 라벨이 길어질수록 좁아진다. 세로 사이드바는 메뉴가 늘어도 한 칸씩 쌓이기만 하고, headlamp를 쓰던 사람에게 익숙한 배치다.
- 탭 전환 로직이 쓰는 tab-button 클래스와 data-tab 속성, tab.active 구조를 그대로 유지했다. 배치만 바꾸는 작업에서 동작 코드를 건드리면 검증 범위가 화면 전체로 넓어진다. HTML 배치와 CSS만 바꿔 renderer.ts 수정 없이 끝냈다.
- 색을 CSS 변수로 옮긴 것은 electron 규칙(색 하드코딩 금지)을 따르기 위해서다. 사이드바를 새로 칠하는 김에 전체를 변수로 옮기면 dark mode가 미디어 쿼리 블록 하나로 끝난다. 테마 토글은 요구사항이 아니므로 만들지 않았다.
- 사이드바는 두 테마 모두 어두운 톤을 유지한다. headlamp도 light 테마에서 사이드바만 어둡게 두는데, 본문 표와 대비가 생겨 화면 구획이 읽힌다.
- 아이콘은 인라인 SVG로 넣었다. CSP가 default-src 'self'라 외부 아이콘 폰트를 쓸 수 없고, 여섯 개뿐이라 파일로 분리할 이유도 없다.
