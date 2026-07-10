---
type: Decision
title: AGENTS.md를 모든 agent의 단일 진입점으로 사용
description: agent 환경 파일을 AGENTS.md 중심으로 재구성하고 코드 규칙은 .claude/rules/로 분리했다.
tags: [agent, workflow]
timestamp: 2026-07-10T00:00:00Z
---

## 결정

AGENTS.md를 모든 AI agent의 단일 진입점으로 삼는다. CLAUDE.md는 AGENTS.md를 가리키는 포인터로만 유지하고, 코드 규칙은 `.claude/rules/`에 주제별 파일로 분리한다.

## 이유

- Claude Code 외의 agent도 늘어나는 상황에서 agent별 환경 파일을 각각 유지하면 규칙이 갈라진다. 진입점을 하나로 두면 규칙 변경이 한 곳에서 끝난다.
- 규칙 전체를 한 파일에 담으면 매 작업마다 불필요한 컨텍스트가 로드된다. 작업 대상에 맞는 규칙 파일만 참조하도록 분리했다.

## Citations

[1] [PR #518 - AI agent 환경 파일을 AGENTS.md 중심으로 재구성](https://github.com/choisungwook/portfolio/pull/518)
