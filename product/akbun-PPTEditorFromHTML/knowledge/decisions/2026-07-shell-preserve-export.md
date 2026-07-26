---
type: Decision
title: export는 원본 shell을 보존하고 페이지 내용만 토큰 치환한다
description: 임포트 때 원본 HTML에서 페이지 내용만 토큰으로 바꾼 껍데기(shell)를 저장하고, export는 토큰을 절대좌표 객체로 치환한다. 원본 CSS/JS가 그대로 남아 퀴즈·페이지 넘김이 동작한다.
tags: [editor, export, akbun-PPTEditorFromHTML]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

임포트 때 원본 문서의 각 section.page 내용을 <!--PPTE:PAGE:i--> 주석 토큰으로 바꾸고, 절대좌표 레이아웃 CSS와 화면 맞춤(zoom) 스크립트를 덧붙여 직렬화한 것을 shellHtml로 모델에 저장한다. export는 각 토큰을 페이지 객체들의 절대좌표 wrapper(div.ppte-obj)로 치환한 문자열이다. 원본의 style, 퀴즈·페이지 넘김·stepper script, 하단 nav는 건드리지 않는다.

## 이유

- "편집 후에도 인터랙션이 살아 있는 학습지"가 요구사항이다. 학습지 JS를 파싱하거나 재생성하면 template 버전마다 깨질 수 있다. 문자 그대로 보존하면 동작이 보장된다.
- export가 순수 문자열 치환이라 결정적이고 node 테스트로 검증된다(test/exporter.test.js). 치환 문자열의 $ 패턴이 replace에 해석되지 않도록 함수 형태를 쓴다 — 실제로 잡은 함정이다.
- 주입 CSS를 head 마지막에 두므로 같은 특이도에서 원본 규칙과 @media 규칙을 이긴다. 절대좌표 페이지(padding 0, 고정 1280x720)가 모바일 media 규칙에 흔들리지 않는 이유다.
- 한계: shell에 남은 원본 JS 중 페이지 내용을 참조하는 코드(퀴즈 등)는 export된 마크업 구조에 의존한다. 객체 wrapper가 내용을 감싸도 querySelector 기반이라 동작하지만, 템플릿 JS가 페이지 직계 자식 구조를 가정하도록 바뀌면 깨질 수 있다.
