---
type: Decision
title: 배포·업데이트·렌더러·버전 관리 방식
description: 무서명 arm64 dmg 배포, dmg 교체 방식 자체 업데이트, 순수 tsc + 전역 script 렌더러, package.json 단일 버전 출처를 쓴다.
tags: [electron, release, update, akbun-PPTEditorFromHTML]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

- 배포: macOS 전용 무서명 arm64 dmg. GitHub Release가 바이너리 저장소이고 tag는 akbun-PPTEditorFromHTML-v{버전} 형식이다.
- 업데이트: 앱이 GitHub Releases API에서 최신 버전을 확인하고, dmg를 fetch로 받아 detached bash 스크립트가 앱 종료 후 .app 번들을 통째로 교체하고 재실행한다(src/main/update.ts). 임시 파일 정리는 세 겹이다: 교체 스크립트의 trap, 스크립트 실행 전 실패 시 삭제, 앱 시작 때 남은 디렉터리 청소.
- 렌더러: 번들러 없이 순수 tsc로 컴파일하고, import/export 없는 전역 script를 index.html이 순서대로 로드한다.
- 버전: package.json의 version이 유일한 출처다. 코드 수정 시 마이너 버전을 +1 하고, CI는 빌드 성공 → tag → release 순서로 진행해 빈 release가 남지 않게 한다.

## 이유

- 개인 배포 앱이라 유료 개발자 계정 기반의 코드 서명·notarization을 쓰지 않는다. 무서명이면 electron-updater(Squirrel.Mac)가 막히지만, 앱이 fetch로 받은 파일에는 quarantine 속성이 붙지 않아 Gatekeeper 검사를 거치지 않는다는 점을 이용하면 직접 교체 업데이트가 가능하다. 브라우저로 dmg를 받는 것보다 설치 경험이 오히려 낫다.
- 실행 중인 앱은 자기 번들을 덮어쓸 수 없으므로 교체는 앱 밖 detached 스크립트가 한다. 교체 실패 시 옮겨 둔 이전 번들을 되돌린다.
- dmg가 100MB를 넘으므로 내려받기는 스트림으로 흘려 쓰고, 임시 파일 정리가 한 군데라도 빠지면 실패할 때마다 디스크가 찬다. test/update-disk-leak.test.js가 세 정리 지점을 검증한다.
- 런타임 의존성 0개를 유지한다. fetch, hdiutil, ditto 모두 플랫폼 내장이다.
- 렌더러에 번들러를 들이지 않는 것은 빌드 파이프라인을 tsc 하나로 유지하기 위해서다. 전역 script 로드 순서가 모듈 그래프를 대신한다.
