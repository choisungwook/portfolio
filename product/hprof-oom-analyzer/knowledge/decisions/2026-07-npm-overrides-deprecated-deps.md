---
type: Decision
title: deprecated transitive 의존성은 scoped overrides로 교체
description: electron-builder가 끌어오는 glob 7(inflight 포함)과 rimraf 2를 npm overrides로 상위 패키지 아래에서만 최신 버전으로 교체한다.
tags: [npm, electron-builder, ci]
timestamp: 2026-07-19T00:00:00Z
---

## 결정

package.json overrides에 @electron/asar 아래 glob을 ^13으로, temp 아래 rimraf를 ^6으로 교체한다. 전역 override가 아니라 상위 패키지를 지정한 scoped override를 쓴다.

## 이유

- npm install 때 deprecated warning(glob@7, inflight, rimraf@2)이 CI 로그를 오염시킨다. 상위 업그레이드로는 해결이 안 된다. app-builder-lib 최신도 @electron/asar 3.4.1을 고정하고, glob 13을 쓰는 asar v4는 ESM 전용이라 CJS인 app-builder-lib이 채택하지 못했다.
- glob 13은 콜백 API가 없어 asar 3.x의 crawl 경로와 호환되지 않지만, electron-builder는 asar의 createPackageFromStreams만 호출하고 glob을 쓰는 crawl은 실행하지 않는 것을 코드로 확인했다. rimraf도 squirrel(Windows) 빌드 전용 경로라 nsis 타겟인 이 프로젝트에서 실행되지 않는다.
- 실행되지 않는 코드 경로만 교체하므로 안전하다. npm install, build, test, dist(dmg 패키징)까지 로컬에서 재현해 검증했다.
- boolean@3.2.0 warning은 남는다. 모든 버전이 deprecated라 override로 제거할 수 없고, @electron/get이 global-agent 의존을 버려야 사라진다.
- 대가: electron-builder가 언젠가 asar의 glob 경로를 실행하도록 바뀌면 override가 런타임 오류를 낸다. electron-builder를 올릴 때 dist까지 돌려 확인해야 한다.
