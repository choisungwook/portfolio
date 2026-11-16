---
type: Decision
title: New features start from an interface
description: The interface comes first and callers import only it; the first implementation is wired in one place.
tags: [architecture, workflow]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
---

## 결정

- akbun-taskq의 새 기능은 인터페이스를 먼저 정의하고 그 인터페이스로 구현한다. 절차는 [development.md](../../wiki/development.md)의 "Add a feature: interface first"에 있다.
- runner, API, CLI, UI는 인터페이스만 import하고, 구현은 registry나 `src/cli/run.ts` 한 곳에서 연결한다.

## 이유

- 사용자가 2026-11-16에 모든 기능을 이 방식으로 만들기로 정했다.
- agent SDK를 Claude에 묶어 둔 탓에 다른 SDK를 붙이려면 파일 이동과 import 수정이 30여 개 파일에 걸렸다. 처음부터 인터페이스 뒤에 두면 구현을 바꾸거나 더할 때 호출하는 쪽을 고치지 않는다. 참고: [AgentBackend 결정](2026-11-agent-backend-interface.md)
- 테스트가 이미 fake worker와 fake SDK로 돌고 있어서, 인터페이스가 있으면 fake를 그 인터페이스의 구현으로 만들면 된다.
