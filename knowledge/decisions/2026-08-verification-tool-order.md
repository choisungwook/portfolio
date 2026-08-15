---
type: Decision
title: 검증 도구는 화면을 뺏지 않는 순서로 고르고, 그 순서는 AGENTS.md 본문에 둔다
description: 내장 브라우저, workspace 테스트 명령, computer use 순으로 검증 수단의 우선순위를 고정하고 도구 중립 원칙의 예외로 AGENTS.md에 인라인으로 적은 결정.
tags: [agent, workflow]
timestamp: 2026-08-16T00:00:00Z
---

## 결정

- 검증 수단에 순서를 둔다. 데스크톱 앱의 내장 브라우저가 1순위, workspace의 테스트 명령이 2순위, computer use가 3순위다.
- computer use는 금지가 아니다. 앞의 두 단계로 확인할 수 없는 것에 도달하면 허락을 묻지 않고 진행한다.
- 이 순서를 [.claude/rules/](../../.claude/rules/) 링크 뒤가 아니라 AGENTS.md 본문에 인라인으로 적는다.
- [규칙 문서는 도구 중립](2026-07-agents-md-tool-neutral.md)의 "사용자가 명시적으로 요청할 때만 예외로 한다" 조항을 쓴 것이다. 이 섹션을 도구 중립 위반으로 보고 CLAUDE.md로 옮기지 않는다.

## 이유

- 화면과 마우스를 잡는 도구가 기본값이면 agent가 도는 동안 사용자가 자기 컴퓨터를 못 쓴다. 순서를 안 정해 두면 agent는 가장 편한 도구를 고르고, 그것이 대개 화면을 잡는 쪽이다.
- 그렇다고 금지하면 자리에 없는 사용자를 기다리며 작업이 선다. 사용자가 자리에 없는 경우가 더 많으므로 멈춰 세우는 쪽이 손해다. 그래서 금지가 아니라 순위다.
- 규칙을 링크 뒤에 두면 Codex에는 닿지 않는다. Codex는 AGENTS.md를 읽지만 그 안의 링크를 따라 들어가는 것은 보장되지 않는다. 도구 중립을 지켜 CLAUDE.md에 두면 정작 이 규칙이 필요한 agent가 읽지 못한다.
- 이전 테스트 섹션은 저장소 어디에도 없는 test.md를 찾아 따르라고 했다. 그 조건에 걸려 있던 Computer Use 조항은 아무것도 막지 못했고, UI 검증 방법을 정한 규칙은 사실상 없었다.

## Citations

1. [PR #914](https://github.com/choisungwook/portfolio/pull/914)
2. [Issue #913](https://github.com/choisungwook/portfolio/issues/913)
