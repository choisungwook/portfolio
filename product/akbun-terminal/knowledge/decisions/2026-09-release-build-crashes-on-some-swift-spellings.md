---
type: Decision
title: release 빌드만 깨지는 Swift 컴파일러 크래시는 표현을 바꿔 피한다
description: Swift 6.2.3의 CopyPropagation 패스가 특정 표현에서 죽고 debug 빌드는 통과하므로, 검증은 release 빌드로 한다.
tags: [swift, compiler, release, verification]
timestamp: 2026-09-11T00:00:00Z
---

## 결정

- Swift 코드를 고친 뒤 `swift build`(debug)만으로 검증을 끝내지 않는다. `swift build -c release` 또는 `scripts/bundle.sh`까지 돌린다.
- 컴파일러가 `Found ownership error?!`로 죽으면 코드를 같은 뜻의 다른 표현으로 바꿔 피한다.

## 이유

- Swift 6.2.3의 `-O` 파이프라인 `CopyPropagation` 패스가 크래시했다. debug 빌드와 `swift test`는 모두 통과했으므로 release 빌드 전까지 아무 신호가 없었다.
- 크래시한 함수는 `TerminalTabBarView.render(tabs:active:)`였고, 원인은 값 타입(`TerminalTabs.Tab`)을 인자 목록 안에서 여러 번 빌려 쓰는 표현이었다. 두 가지를 함수 호출 **밖으로** 빼내 로컬에 담으니 통과했다.
  - `Set(tabs.compactMap(\.session))` 같은 keypath 체인을 평범한 for 루프로
  - 인자 목록 안의 `tab.session.flatMap { ... } ?? .idle`을 호출 전 로컬 변수로
- 컴파일러 버그이므로 코드가 틀린 것은 아니다. 우회 지점에 이유를 주석으로 남겨 두지 않으면 다음 사람이 "불필요하게 장황한 코드"로 보고 되돌린다.
