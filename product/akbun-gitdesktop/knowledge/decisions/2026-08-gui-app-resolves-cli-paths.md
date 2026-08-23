---
type: Decision
title: GUI 앱은 CLI의 알려진 설치 경로를 직접 탐색
description: Electron 프로세스의 PATH 밖에 설치된 git과 gh를 절대 경로로 찾아 실행한다.
tags: [electron, cli, macos, github]
timestamp: 2026-08-23T00:00:00Z
---

# GUI 앱은 CLI의 알려진 설치 경로를 직접 탐색

## 결정

git과 gh 실행 전에 현재 PATH와 알려진 설치 경로에서 실행 파일을 찾는다.

* Homebrew 기본 경로인 /opt/homebrew/bin과 /usr/local/bin 포함
* 사용자 도구 경로인 .local/bin, mise, asdf, Nix 경로 포함
* 탐색에 성공하면 명령 이름이 아니라 절대 경로로 실행

## 이유

Finder에서 실행한 macOS GUI 앱은 터미널의 shell 초기화 파일을 읽지 않는다. 터미널에서는 gh가 동작해도 Electron 프로세스의 PATH에는 Homebrew 경로가 없어 설치되지 않은 것으로 오판할 수 있다.

shell을 띄워 초기화 파일을 실행하면 사용자 설정에 따라 출력과 지연이 달라진다. 알려진 경로를 직접 검사하면 shell 설정에 의존하지 않고 git 실행과 상태 점검이 같은 경로를 사용한다.
