---
type: Decision
title: 업데이트는 dmg를 직접 받아 앱 번들을 교체한다
description: 서명이 없어 electron-updater를 못 쓰므로, fetch로 받은 dmg에 quarantine이 붙지 않는 점을 이용해 외부 스크립트가 .app을 통째로 바꾸고 재실행한다.
tags: [electron, release, update, gatekeeper, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

상단 메뉴의 업데이트 확인은 src/main/update.ts가 처리한다. GitHub Releases API에서 akbun-shadowing-player-v 접두사의 최신 release를 찾아 버전을 비교하고, 새 버전이 있으면 "지금 업데이트" 버튼을 보여준다. 누르면 현재 아키텍처에 맞는 dmg를 fetch로 임시 디렉터리에 받고, 앱 밖에서 도는 bash 스크립트를 detached로 띄운 뒤 앱을 끝낸다. 스크립트는 앱 종료를 기다렸다가 dmg를 mount해 .app 번들을 통째로 교체하고 다시 실행한다. 교체에 실패하면 옮겨 둔 이전 번들을 되돌린다. 개발 모드(app.isPackaged가 false)에서는 교체 대상이 Electron.app이므로 설치를 막고 릴리스 페이지만 연다.

## 이유

- macOS의 electron-updater(Squirrel.Mac)는 코드 서명과 notarization을 전제로 한다. 이 앱은 [무서명 dmg 배포](2026-07-macos-only-unsigned-dmg.md)라서 표준 자동 업데이트 경로가 막혀 있다.
- 무서명이 오히려 직접 교체를 가능하게 한다. Gatekeeper의 "damaged" 오류는 브라우저가 내려받은 파일에 붙는 quarantine 확장 속성 때문인데, 앱이 fetch로 받은 파일에는 quarantine이 붙지 않아 검사 자체를 거치지 않는다. 사용자가 xattr를 칠 필요가 없어지므로 브라우저 다운로드보다 설치 경험이 낫다.
- 실행 중인 앱은 자기 번들을 덮어쓸 수 없다. 그래서 교체는 detached 스크립트가 앱 종료 후에 수행한다.
- 버전 tag가 릴리스의 단일 진실 원천이다. package.json의 version은 빌드 시점에 tag에서 주입되므로 [tag 마이너 +1 규칙](2026-07-release-tag-auto-minor-bump.md)과 비교 대상이 맞는다.
- 런타임 의존성 0개를 유지한다. fetch, hdiutil, ditto 모두 플랫폼 내장이다.
- 한계: 교체 로직의 끝까지 검증은 패키징된 앱에서만 가능하다. 개발 모드에서는 차단되어 있어, 실제 dmg 설치본에서 다음 릴리스로 올려 보는 것이 최종 검증이다.
