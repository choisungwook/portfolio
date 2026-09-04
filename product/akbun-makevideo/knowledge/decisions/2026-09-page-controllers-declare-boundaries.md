---
type: Decision
title: page controller는 의존성과 공개 경계를 선언한다
description: no-build classic script를 factory controller로 나누고 생성 시 의존성과 반환 API를 명시한다.
tags: [makevideo, javascript, architecture, testing]
timestamp: 2026-09-04T00:00:00Z
---

# page controller는 의존성과 공개 경계를 선언한다

## 결정

* Program Monitor, timeline 상호작용, Inspector, 단축키, 앱 초기화를 factory controller로 분리
* controller 생성 시 DOM, 상태, API, 다른 controller 기능을 의존성 객체로 전달
* classic script 전역에는 controller factory 하나만 공개

## 이유

* build step 없이 script tag 실행 순서를 유지하면서 기능별 변경 범위 축소
* 숨은 전역 참조를 생성 경계에서 드러내 브라우저 초기화 오류 추적 가능
* controller 내부 상태와 helper가 renderer 전역으로 새지 않도록 제한
