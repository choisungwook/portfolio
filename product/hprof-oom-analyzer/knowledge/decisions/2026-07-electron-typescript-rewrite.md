---
type: Decision
title: TypeScript + Electron 전환
description: Python/Tkinter 구현을 TypeScript + Electron 데스크톱 앱으로 다시 만들고, 분석 로직은 Electron 비의존 core 모듈로 분리했다.
tags: [typescript, electron, architecture]
timestamp: 2026-07-18T00:00:00Z
---

## 결정

첫 구현이었던 Python/Tkinter + PyInstaller 버전을 버리고 TypeScript + Electron으로 다시 만들었다. 이때 파서·분석기·리포트는 src/core에 Electron 비의존 순수 모듈로 분리하고, GUI(src/main, src/renderer)와 CLI(src/cli.ts)가 같은 core를 공유하는 구조로 잡았다.

## 이유

- 유지보수자에게 친숙한 스택이 우선이다. 기능이 동등하다면 다시 읽고 고칠 수 있는 언어가 낫다.
- Tkinter는 GUI 표현력이 제한적이고, PyInstaller + tcl/tk 번들링은 OS별 이식성 문제가 잦다. Electron은 electron-builder가 AppImage/dmg/nsis 인스톨러 생성을 표준으로 지원한다.
- core 분리 덕분에 vitest 테스트와 CI 스모크 테스트가 GUI 없이 돈다. 헤드리스 컨테이너에서도 로컬 검증이 가능하다.
- 대가로 배포물 크기가 커졌다(수 MB → 100MB 안팎). 학습용 미니 도구라 허용했다.

바이너리 포맷 지식은 [hprof 포맷 요약](../topics/hprof-format.md)으로 언어와 무관하게 남겼으므로, 전환 시 파서 로직은 1:1 포팅으로 끝났다.
