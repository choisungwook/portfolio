---
type: Decision
title: 로그는 macOS 관례 위치에 자체 rotation 로거로 기록
description: 의존성 없이 ~/Library/Logs/앱이름/main.log에 쓰고 1MB 크기 기준으로 5개까지 rotation한다.
tags: [electron, logging, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

electron-log 같은 라이브러리를 추가하지 않고 src/main/logger.ts를 직접 작성한다. 로그 디렉터리는 app.getPath("logs")로 얻는 macOS 사용자 로그 관례 위치(~/Library/Logs/akbun-shadowing-player/)를 쓰고, main.log가 1MB를 넘으면 main.log.1~5로 번호를 밀어 rotation한다. 렌더러의 잡히지 않은 오류(error, unhandledrejection)는 log:error IPC 채널로 main에 보내 같은 파일에 남긴다.

## 이유

- 파일 클릭 무반응 버그를 조사할 때 오류가 어디에도 남지 않아 원인 확인이 늦었다. devtools를 열지 않는 사용자도 로그 파일로 오류를 확인할 수 있어야 한다.
- 이 프로젝트는 런타임 의존성이 0개다. 필요한 기능이 append와 크기 rotation뿐이라 라이브러리를 들이는 것보다 60줄짜리 자체 구현이 유지비가 적다.
- app.getPath("logs")는 macOS에서 ~/Library/Logs/앱이름을 돌려주는 사용자 권한 경로다. 시스템 로그 경로(/Library/Logs)와 달리 권한 상승이 필요 없다.
