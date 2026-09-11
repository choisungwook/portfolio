---
type: Decision
title: .app은 번들이 아니라 실행파일에 서명한다
description: SwiftPM resource bundle이 .app 루트에 있어야 하므로 번들 단위 codesign을 포기하고 실행파일만 ad-hoc 서명한다.
tags: [macos, swiftpm, codesign, release]
timestamp: 2026-09-11T00:00:00Z
---

## 결정

- `codesign --deep`로 `.app` 전체를 서명하지 않는다. `.build/release`의 실행파일을 `.app`에 복사하기 **전에** ad-hoc 서명하고, 서명된 채로 복사한다.
- SwiftPM resource bundle(`*.bundle`)은 `.app` 루트에 그대로 둔다.

## 이유

- executable target의 `Bundle.module`은 `Bundle.main.bundleURL` 바로 아래만 본다. `.app`에서 그 경로는 번들 루트다. 의존성(HighlighterSwift)이 자기 `Bundle.module`을 쓰므로 접근자를 우회할 수 없다.
- codesign은 번들 루트에 `Contents` 말고 다른 것이 있으면 `unsealed contents present in the bundle root`로 거부한다. `Contents/Resources`로 옮기면 런타임에 리소스를 못 찾고, 루트에 symlink를 걸어도 codesign이 똑같이 거부한다. 둘 다 실험으로 확인했다.
- `.app` 안의 실행파일을 직접 서명하면 codesign이 상위 번들을 찾아 그것을 서명하려 하므로 같은 이유로 실패한다. 복사 전에 서명하는 것만 통한다.
- arm64가 요구하는 것은 실행파일의 서명이지 번들 서명이 아니다. 어차피 Developer ID가 아니라 Gatekeeper는 다운로드를 격리한다.

## 배경

이 문제로 v0.10.0과 v0.11.0의 release job이 연속으로 실패했고, master에는 코드가 있는데 사용자는 v0.9.0을 쓰고 있었다. PR에서는 `verify` job만 돌아 초록불이었으므로 아무도 보지 못했다. 증상 보고를 받으면 코드를 고치기 전에 `gh release list`와 설치본 버전을 대조한다.
