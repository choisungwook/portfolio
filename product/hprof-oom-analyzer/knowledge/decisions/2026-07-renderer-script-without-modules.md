---
type: Decision
title: renderer는 모듈 없는 스크립트로 작성
description: 렌더러 TypeScript를 import/export 없이 작성하고 tsconfig.renderer.json에서 module none으로 컴파일해 script 태그로 로드한다.
tags: [electron, typescript, build]
timestamp: 2026-07-18T00:00:00Z
---

## 결정

src/renderer/renderer.ts는 import/export를 쓰지 않는 스크립트로 작성한다. 별도 tsconfig.renderer.json이 module: none, lib: DOM으로 컴파일하고, static/index.html이 script 태그로 로드한다. main 프로세스와 주고받는 IPC 데이터 타입은 src/renderer/api.d.ts의 전역 선언(declare)으로 정의한다.

## 이유

- Electron 기본값인 contextIsolation 환경에서 렌더러는 Node 모듈 시스템이 없다. tsc가 CommonJS로 뽑은 파일은 exports 참조 때문에 브라우저에서 바로 깨진다.
- webpack/vite 같은 번들러를 넣으면 해결되지만, 파일 3개짜리 UI에 빌드 도구 계층을 추가하는 비용이 더 크다. tsc 2회 실행만으로 전체 빌드가 끝나는 단순함을 지켰다.
- module: none은 실수로 모듈 문법을 쓰는 순간 컴파일 에러를 내므로, 이 제약이 코드에 강제된다.
- 대가: core의 타입과 함수를 renderer에서 직접 import할 수 없다. 타입은 api.d.ts에 DTO로 중복 정의하고, formatSize 같은 소형 헬퍼는 renderer에 복제했다. main.ts의 IPC 반환 형태를 바꾸면 api.d.ts를 수동으로 맞춰야 한다.

렌더러 UI가 커져서 이 제약이 부담이 되면 그때 vite 도입을 검토한다.
