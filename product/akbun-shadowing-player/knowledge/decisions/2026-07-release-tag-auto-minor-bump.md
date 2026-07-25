---
type: Decision
title: 릴리스 버전은 tag에서 마이너 +1로 자동 계산
description: master push마다 가장 최근 tag의 마이너 버전을 +1 해서 새 tag와 release를 만든다.
tags: [github-actions, release, akbun-shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

release workflow의 tag job이 기존 tag(akbun-shadowing-player-v*, 예전 prefix shadowing-player-v* 포함) 중 가장 최근 버전을 찾아 마이너를 +1 한 버전으로 tag와 GitHub Release를 만든다. 빌드 job은 npm version --no-git-tag-version으로 계산된 버전을 package.json에 주입해 dmg 파일명에 반영한다.

## 이유

- 이전 방식은 package.json 버전으로 tag를 만들고 tag가 이미 있으면 릴리스를 건너뛰었다. 버전 올리는 commit을 잊으면 master에 merge해도 릴리스가 조용히 스킵되는 문제가 있었다.
- 버전의 단일 진실 원천을 git tag로 옮기면 사람이 버전을 관리할 필요가 없어진다. package.json version은 릴리스에 쓰지 않는 형식 값이 된다.
- 제품 이름을 shadowing-player에서 akbun-shadowing-player로 바꾸면서 tag prefix도 바뀌었는데, 예전 prefix의 tag도 이전 버전으로 인정해 버전 연속성(0.1.0 → 0.2.0)을 유지한다.
