---
type: Decision
title: 서명 없는 데스크톱 앱의 자동 업데이트는 dmg를 받아 번들을 교체한다
description: electron-updater 대신 dmg를 직접 받아 .app 번들을 바꾸는 방식을 모든 데스크톱 product의 기본으로 둔다.
tags: [electron, macos, release, product]
timestamp: 2026-07-31T00:00:00Z
---

2026-08-29부터 [Tauri updater 전환](./2026-08-tauri-signed-updater.md)이 이 결정을 대체한다.

## 결정

product의 데스크톱 앱은 자동 업데이트를 electron-updater가 아니라 dmg 교체 방식으로 만든다. akbun-k8supgradeview의 구현을 새 제품에 포팅하고, 다음 네 가지를 반드시 유지한다.

* GitHub Release에서 `<제품명>-v` 접두사 tag를 찾고 실행 중인 아키텍처에 맞는 dmg를 고른다.
* dmg를 임시 디렉터리로 스트리밍한 뒤 detached bash 스크립트를 띄우고 앱을 종료한다. 스크립트가 pid를 기다렸다가 번들을 교체하고 다시 실행한다.
* 임시 디렉터리 정리 지점 세 곳(내려받기 실패, 스크립트의 trap, 앱 시작 시 청소)을 모두 남기고, 하나라도 사라지면 실패하는 테스트를 함께 포팅한다.
* 패키징된 빌드에서만 설치를 제안한다.

이 절차를 [.claude/commands/repo-product-create.md](../../.claude/commands/repo-product-create.md)의 Self update 항목으로 옮겨, 새 제품을 만들 때 매번 다시 판단하지 않게 했다.

2026-08-04에 자리를 한 번 더 옮겼다. 자동 업데이트는 제품 생성 명령이 아니라 stack 규칙([.claude/rules/electron.md](../../.claude/rules/electron.md), [.claude/rules/tauri.md](../../.claude/rules/tauri.md))의 기본 요구사항이다. 생성 명령은 새 제품을 만들 때만 읽히므로, 이미 있는 앱에 업데이트가 빠져 있으면 아무도 그 사실을 만나지 않는다. akbun-gitdesktop이 릴리스를 두 번 냈는데 업데이트 경로가 없었던 것이 그 결과다.

## 이유

유료 개발자 계정이 없어 빌드에 서명이 없다. electron-updater가 macOS에서 쓰는 Squirrel.Mac은 서명이 없는 업데이트의 설치를 거부하므로 기본 경로 자체가 막혀 있다.

번들을 손으로 바꾸는 방식이 동작하는 이유는 한 가지 세부사항 때문이다. 앱이 스스로 fetch로 받은 파일에는 quarantine 속성이 붙지 않아 Gatekeeper 검사를 거치지 않는다. 사용자는 릴리스 페이지에서 손으로 받은 최초 dmg에만 `xattr -cr`을 한 번 하면 된다.

정리 지점을 세 곳이나 두는 이유는 dmg가 크고 누수가 조용하기 때문이다. 실패할 때마다 수백 MB가 쌓이지만 사용자에게 아무 신호가 없어, 손으로 확인하기 어렵다. 그래서 정리 코드가 사라지면 깨지는 테스트를 구현과 한 몸으로 옮긴다.

akbun-k8supgradeview, akbun-shadowing-player, akbun-mactaskbar 세 제품이 같은 코드를 쓴다. 세 번째 포팅에서야 규칙으로 옮겼는데, 두 번째에서 옮겼다면 판단을 한 번 덜 반복했을 것이다.
