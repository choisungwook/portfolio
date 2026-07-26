---
type: Decision
title: 업데이트는 dmg 직접 내려받기와 번들 교체로 구현
description: 메뉴의 업데이트 확인이 GitHub Release를 조회하고, 새 버전이면 dmg를 받아 .app 번들을 교체한다.
tags: [electron, update]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

상단 메뉴 {앱 이름} > 업데이트 확인이 GitHub Release API에서 akbun-k8supgradeview-v 태그의 최신 버전을 찾아 현재 버전과 비교한다. 새 버전이면 dmg를 임시 디렉터리에 받아 교체 스크립트를 분리 프로세스로 띄우고 앱을 종료하며, 스크립트가 .app 번들을 통째로 바꾸고 재실행한다. akbun-shadowing-player의 업데이트 구현과 같은 구조를 그대로 가져왔다.

디스크 누수 방지를 핵심 요구사항으로 두고 정리 지점을 세 곳에 두었다.

1. downloadDmg가 내려받기 실패 시 만든 임시 디렉터리를 지운다.
2. 교체 스크립트의 trap이 어느 단계에서 실패해도 작업 디렉터리와 mount를 지운다.
3. 앱 시작 때 cleanupTempDirs가 강제 종료로 남은 임시 디렉터리를 지운다.

세 지점은 test/update-disk-leak.test.js가 검증하며 PR verify job에서 실행된다.

## 이유

- dmg가 무서명이라 Squirrel.Mac 기반 자동 업데이트(electron-updater)를 쓸 수 없다. 앱이 fetch로 받은 파일에는 quarantine 속성이 붙지 않아 Gatekeeper를 거치지 않고 교체할 수 있다.
- 저장소의 기존 구현(akbun-shadowing-player)이 이미 같은 릴리즈 구조(태그 형식, arm64 dmg)에서 동작하고 있어 검증된 코드를 재사용했다.
- dmg는 용량이 커서 정리가 한 군데라도 빠지면 실패할 때마다 디스크가 찬다. 정리 지점이 세 곳으로 흩어져 있어 수동 확인이 어렵고, 회귀를 막으려면 테스트가 필요하다.

## Citations

1. product/akbun-shadowing-player/src/main/update.ts
2. product/akbun-shadowing-player/test/update-disk-leak.test.js
