---
type: Decision
title: 콘텐츠 확대와 주변 패널 크기 분리
description: 단축키는 읽는 콘텐츠에만 적용하고 주변 UI 크기는 General 설정으로 저장
tags: [swift, appkit, settings]
timestamp: 2026-09-18T00:00:00Z
---

## 결정

- Cmd +/−/0은 터미널과 문서 콘텐츠에만 적용
- 프로젝트·파일·Git·검색 패널과 탭 바는 General의 Panel size 값 사용
- 패널 배율은 75~200%, 기본값 100%로 UserDefaults에 저장
- 분할 패널 너비는 기존 divider 드래그로 조절

## 이유

- 읽는 콘텐츠를 확대할 때 탐색 UI까지 변하면 작업 공간이 좁아짐
- 주변 UI의 가독성 설정은 재실행 뒤에도 유지해야 하며 프로젝트 상태와 독립적임
