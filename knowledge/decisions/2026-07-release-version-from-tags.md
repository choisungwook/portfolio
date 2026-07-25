---
type: Decision
title: 릴리스 버전은 태그에서 계산한다
description: package.json version에 의존하는 대신 기존 태그의 patch를 +1 해서 매 실행마다 새 릴리스를 만든다.
tags: [github-actions, release, electron]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

product 앱의 release workflow는 다음 버전을 package.json이 아니라 기존 태그에서 계산한다.

- 가장 높은 `<prefix>-vX.Y.Z` 태그를 찾아 patch를 +1 한 값을 다음 버전으로 쓴다.
- package.json의 version이 그보다 높으면 그 값을 쓴다. major, minor 변경은 package.json을 직접 올려서 한다.
- 계산한 태그가 이미 존재하면 workflow를 실패시킨다.
- 빌드 직전에 `npm version --no-git-tag-version`으로 계산한 값을 package.json에 넣어 앱 버전과 릴리스 태그를 맞춘다.

## 이유

package.json version만 보고 태그를 만들면 버전을 올리지 않은 변경은 릴리스가 통째로 건너뛰어진다. master에 병합했는데 설치 파일이 갱신되지 않는 상태가 조용히 생기고, 반대로 태그를 강제로 덮어쓰면 이미 배포된 릴리스의 내용이 바뀐다.

태그를 진실의 원천으로 삼으면 두 문제가 같이 사라진다. 사람이 버전을 올리는 것을 잊어도 릴리스는 나가고, 계산 결과가 항상 기존 최대값보다 크므로 덮어쓸 태그가 존재하지 않는다. package.json을 우선하는 예외를 남긴 이유는 major, minor 변경만큼은 자동 계산이 판단할 수 없어 사람이 명시해야 하기 때문이다.

관련 결정: [Electron 릴리스 빌드는 macOS만](2026-07-electron-release-macos-only.md)
