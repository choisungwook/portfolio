---
type: Decision
title: 순수 tsc + script 렌더러 패턴 재사용, module은 es2022
description: hprof-oom-analyzer의 번들러 없는 구조를 따르되 TypeScript 7 제약으로 module none 대신 es2022를 쓴다.
tags: [electron, typescript, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

번들러(vite 등) 없이 tsc 2회 컴파일(main + renderer)로 빌드한다. 렌더러는 import/export 없는 script 파일로 작성하고 index.html이 waveform.js → renderer.js 순서로 로드한다. tsconfig.renderer.json의 module은 es2022로 둔다.

## 이유

- hprof-oom-analyzer에서 검증한 패턴([renderer script 결정](../../../hprof-oom-analyzer/knowledge/decisions/2026-07-renderer-script-without-modules.md))이다. 의존성이 적고 빌드가 단순하다.
- TypeScript 7이 module: none과 moduleResolution: node10을 제거했다. import/export가 없는 파일은 module 값과 무관하게 전역 script로 컴파일되므로 es2022로 두면 동작이 같다. main 쪽은 module: nodenext로 두면 package.json에 type: module이 없어 CommonJS로 나온다.
- UI가 화면 2개 규모라 React 같은 프레임워크 없이 DOM 조작으로 충분하다.
