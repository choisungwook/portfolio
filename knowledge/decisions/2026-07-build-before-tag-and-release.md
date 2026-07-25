---
type: Decision
title: 릴리스는 빌드 성공 뒤에 tag, tag 뒤에 release
description: 빌드 결과물이 나온 뒤에만 tag를 만들고, tag가 만들어진 뒤에만 release를 만든다.
tags: [github-actions, electron, release]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

product 릴리스 workflow는 빌드 -> tag -> release 순서를 지킨다.

* 빌드 job이 성공해야 tag를 만든다.
* tag push가 성공해야 release를 만든다.
* artifact를 job 사이로 넘기지 않도록 세 단계를 한 job 안의 연속된 step으로 둔다.

## 이유

akbun-shadowing-player workflow는 tag job이 tag와 release를 먼저 만들고 build job이 뒤에서 dmg를 업로드했다. 빌드가 실패하면 첨부 파일 없는 release와 그 release에 딸린 tag가 저장소에 남았고, 다음 실행은 그 tag를 이전 버전으로 인정해 버전만 올라갔다.

세 단계를 한 job의 step으로 두면 실패 시 뒤 단계가 자동으로 멈춘다. 별도 job으로 나누면 dmg를 upload-artifact와 download-artifact로 주고받아야 하는데, 얻는 것 없이 단계만 늘어난다. akbun-gitdesktop 릴리스 workflow가 이미 같은 구조다.

관련 결정: [릴리스 버전은 태그에서 계산한다](2026-07-release-version-from-tags.md), [Electron 릴리스 빌드는 macOS만](2026-07-electron-release-macos-only.md)
