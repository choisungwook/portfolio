---
type: Decision
title: Program Monitor 가이드는 앱 설정과 편집용 pass에 둔다
description: 안전 영역과 구도 가이드를 렌더 결과가 아닌 정지 Program Monitor 위에만 표시한다.
tags: [tauri, video-editing, program-monitor]
timestamp: 2026-08-09T01:59:34Z
---

## 결정

- 안전 영역, 3분할, 중심선을 프로젝트 파일이 아닌 앱 설정으로 저장
- 가이드를 WebView의 편집용 canvas pass에만 그림
- 가이드가 켜진 동안에는 WebView 미리보기를 사용하고 끄면 네이티브 Program Monitor로 복귀

## 이유

- 가이드는 편집자가 보는 방식이라 프로젝트를 다른 환경에서 열 때 함께 이동할 필요 없음
- export가 읽는 합성 경로와 분리해 가이드가 결과 파일에 섞일 가능성 제거
- 네이티브 surface가 WebView 위에 있어 페이지 canvas를 직접 덮을 수 없으므로, 가이드가 필요한 동안 WebView 미리보기로 전환
