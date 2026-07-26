---
type: Decision
title: package.json version 기반 macOS arm64 전용 릴리즈
description: master 머지 시 GitHub Actions가 package.json의 version으로 태그와 릴리즈를 만들고 macOS arm64 dmg만 빌드한다.
tags: [github-actions, release]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

release-akbun-shadowing-player 워크플로우와 같은 구조를 따른다. master에 workspace 변경이 머지되면 macOS 러너가 arm64 dmg를 빌드하고, 빌드 성공 후에 akbun-k8supgradeview-v<version> 태그를 만들고, 태그 생성 후에 릴리즈를 만든다. 버전은 workspace/package.json의 version에서만 관리한다. PR에서는 ubuntu 러너가 tsc 컴파일만 검증한다. 의존성 설치는 lockfile 기반 npm ci를 사용한다.

## 이유

- 처음에는 release-tistory-skin을 참고해 macOS, Linux, Windows 3개 러너 매트릭스로 빌드했다. 이후 저장소의 데스크톱 앱 릴리즈 관례인 release-akbun-shadowing-player 구조로 통일했다.
- 현재 사용자는 Apple Silicon macOS뿐이라 arm64 dmg만 빌드한다. Windows, Linux, x64는 필요해질 때 electron-builder 설정과 워크플로우에 추가한다.
- 빌드 성공 -> 태그 -> 릴리즈 순서로 만들면 실패한 빌드가 태그나 릴리즈를 남기지 않는다.
- version을 코드와 같은 곳(package.json)에서 관리하면 태그를 따로 만드는 절차가 없어진다. version을 올리지 않은 머지는 태그 중복으로 실패하므로 workspace 코드 변경 시 version을 함께 올린다.

## Citations

1. .github/workflows/release-akbun-shadowing-player.yml
