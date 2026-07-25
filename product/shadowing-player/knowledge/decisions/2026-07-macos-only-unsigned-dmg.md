---
type: Decision
title: macOS 전용 무서명 dmg로 배포
description: 빌드 대상을 macOS(arm64, x64) dmg로 한정하고 코드 서명은 하지 않는다.
tags: [electron-builder, macos, shadowing-player]
timestamp: 2026-07-25T00:00:00Z
---

## 결정

electron-builder 대상을 mac dmg(arm64, x64)만 둔다. Developer ID 서명은 하지 않는다.

## 이유

- 사용자가 macOS에서만 쓰는 개인 학습 도구다. Windows/Linux 대상을 유지하면 CI와 의존성 관리 비용만 늘어난다.
- 무서명 배포의 트레이드오프(Gatekeeper 우회 필요)는 [hprof-oom-analyzer의 결정](../../../hprof-oom-analyzer/knowledge/decisions/2026-07-unsigned-mac-distribution.md)과 같다. 서명 identity가 생기면 그때 붙인다.
