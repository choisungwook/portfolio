---
type: Decision
title: Electron + TypeScript, 번들러 없는 tsc 빌드
description: 크로스플랫폼 데스크톱 앱을 Electron과 TypeScript로 만들고 빌드는 tsc와 파일 복사만으로 구성한다.
tags: [electron, typescript]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

macOS를 우선 지원하되 Windows, Linux로 확장할 수 있도록 Electron + TypeScript를 사용한다. renderer는 프레임워크 없이 DOM API로 작성하고, 빌드는 tsc 컴파일 두 번(main, renderer)과 정적 파일 복사만으로 구성한다. 번들러(webpack, vite 등)는 쓰지 않는다.

## 이유

- Electron은 크로스플랫폼 데스크톱에서 레퍼런스가 가장 많아 유지보수와 문제 해결이 쉽다. electron-builder로 dmg, AppImage, exe 패키징이 한 번에 된다.
- 화면이 테이블 중심의 조회 도구라 프레임워크와 번들러가 주는 이득이 작고, 빌드 파이프라인이 단순할수록 다음 작업자가 이해하기 쉽다.
- renderer 코드는 import/export 없이 작성해 plain script로 로드한다. 그 대신 전역 타입 이름이 DOM 내장 타입과 겹칠 수 있어 주의가 필요하다(wiki의 development.md 참고).
