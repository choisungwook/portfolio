---
type: Decision
title: updater 공개키는 서명 secret과 같은 키쌍에서 가져오고 release가 key id를 검사한다
description: 앱에 박힌 공개키와 CI 서명 키가 달라 0.42 이후 업데이트가 전부 실패한 뒤 정한 규칙.
tags: [tauri, updater, release]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-08T04:00:00Z }
---

# updater 공개키는 서명 secret과 같은 키쌍에서 가져오고 release가 key id를 검사한다

## 결정

- `tauri.conf.json`의 `plugins.updater.pubkey`는 `~/.tauri/akbun-makevideo.key.pub` 내용을 그대로 쓴다. 이 키쌍의 개인키가 `TAURI_SIGNING_PRIVATE_KEY_MAKEVIDEO` secret이다.
- release workflow는 fixed tag에 `latest.json`을 올리기 전에 각 platform 서명의 key id와 앱 공개키의 key id를 비교하고, 다르면 실패한다.

## 이유

- 첫 커밋의 공개키(key id `F4B7C0020AF2BF15`)와 이후 만든 서명 키(`08D4B1A456347C04`)가 짝이 아니었음. release는 매번 성공했지만 설치본은 Check for Updates마다 "signature was created with a different key"로 실패했고 errors.log에만 남았음.
- 서명 검증은 설치본 안에서만 일어나서 CI 초록불로는 드러나지 않음. key id 비교는 비밀 없이 공개 정보만으로 같은 실패를 release 시점에 잡음.
- 예전 공개키가 박힌 0.45.0 이하 설치본은 스스로 업데이트할 수 없음. dmg로 한 번 재설치해야 함.
