---
type: Decision
title: akbun-shadowing-player의 Electron 제품 패턴을 계승한다
description: 무서명 arm64 dmg 배포, dmg 교체 방식 업데이트, 순수 tsc + 전역 script 렌더러, package.json 단일 버전 출처, 릴리스 workflow 구조를 akbun-shadowing-player에서 그대로 가져왔다.
tags: [electron, release, update, akbun-PPTEditorFromHTML]
timestamp: 2026-07-26T00:00:00Z
---

## 결정

이 제품은 새 패턴을 만들지 않고 akbun-shadowing-player가 검증한 패턴을 계승한다.

- 배포: macOS 전용 무서명 arm64 dmg. [원 결정](../../../akbun-shadowing-player/knowledge/decisions/2026-07-macos-only-unsigned-dmg.md)
- 업데이트: GitHub Releases에서 dmg를 받아 detached 스크립트가 .app 번들을 통째로 교체. src/main/update.ts는 접두사(태그 akbun-PPTEditorFromHTML-v, 임시 디렉터리)만 바꾼 사본이다. [원 결정](../../../akbun-shadowing-player/knowledge/decisions/2026-07-update-download-and-swap.md)
- 렌더러: 번들러 없이 순수 tsc, import/export 없는 전역 script를 index.html이 순서대로 로드. [원 결정](../../../akbun-shadowing-player/knowledge/decisions/2026-07-plain-tsc-script-renderer.md)
- 버전: package.json version이 유일한 출처, 코드 수정 시 마이너 +1. [원 결정](../../../akbun-shadowing-player/knowledge/decisions/2026-07-version-source-package-json.md)
- CI: PR은 ubuntu에서 테스트만, master push는 macos에서 빌드 성공 → tag → release 순서.

## 이유

- 사용자가 업데이트 기능·버전 관리·workflow를 shadowing-player와 같게 만들라고 명시했다.
- 이 패턴들은 shadowing-player에서 여러 릴리스를 거치며 함정(빈 release, 임시 파일 누적, tag 충돌)이 이미 제거된 상태다. 같은 저장소의 제품이 같은 절차를 쓰면 운영 부담이 늘지 않는다.
- update.ts를 공용 모듈로 빼지 않고 사본으로 둔 것은 의도다. 제품마다 태그 접두사·릴리스 노트가 다르고, product/ 디렉터리들은 서로 독립적으로 빌드된다. 두 파일이 갈라질 이유가 생기면 그때 공용화를 검토한다.
