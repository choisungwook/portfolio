---
type: Decision
title: 릴리스 버전의 단일 출처를 package.json으로 되돌림
description: tag에서 버전을 자동 계산하던 방식을 버리고 package.json version을 유일한 출처로 쓴다.
tags: [github-actions, release, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

release workflow는 package.json의 version을 읽어 akbun-shadowing-player-v{버전} tag와 GitHub Release를 만든다. 코드를 수정하는 커밋은 마이너 버전을 +1 한다(AGENTS.md 규칙). [tag에서 마이너 +1로 자동 계산하던 이전 결정](2026-07-release-tag-auto-minor-bump.md)을 대체한다.

## 이유

- tag 자동 계산 방식은 사람이 버전을 안 올려도 되는 대신, 버전이 저장소 밖(tag 목록)에만 존재해 코드만 봐서는 현재 버전을 알 수 없고 fetch-depth: 0 전체 clone이 필요했다.
- package.json 방식의 원래 문제였던 "버전 올리기를 잊으면 릴리스가 조용히 스킵"은 순서 변경으로 해결됐다. 빌드 성공 후 tag push가 이미 존재하는 tag에서 실패하므로 잊으면 workflow가 시끄럽게 실패한다.
- 버전이 코드와 같은 commit에 있으면 checkout이 shallow clone으로 충분해지고, 앱의 업데이트 확인(app:info의 버전)과 릴리스 버전이 같은 값에서 나온다.
