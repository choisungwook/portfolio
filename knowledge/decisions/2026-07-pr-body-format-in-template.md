---
type: Decision
title: PR body 형식의 기준은 pull request template 하나다
description: 섹션 구성과 항목 형식을 template에만 두고 AGENTS.md와 rules와 slash command는 참조만 한다.
tags: [workflow, github]
timestamp: 2026-07-31T00:00:00Z
---

## 결정

PR body의 섹션은 Decisions와 Implementation 둘이다. 각 항목은 요약 한 줄과 그 아래 근거 항목들로 쓰고, 앞으로의 작업에도 영향을 주는 항목은 앞에 [Important]를 붙여 위로 올린다.

이 형식은 [.github/pull_request_template.md](../../.github/pull_request_template.md)에만 적는다. AGENTS.md, `.claude/rules/workflow.md`, `.claude/commands/repo-pr-create.md`는 template을 읽으라고만 하고 섹션 이름과 항목 형식을 옮겨 적지 않는다.

## 이유

- 형식이 네 곳에 흩어져 있으면 한 곳만 고쳐도 나머지가 낡은 지시로 남는다. 실제로 rules와 command에 남아 있던 Goal 3문장 규칙이 template과 어긋나 있었다.
- Goal과 How I solved it은 무엇을 했는지만 남기고 왜 그렇게 했는지는 남기지 않았다. Decisions를 앞에 두면 판단 근거가 PR의 첫 화면에 온다.
- 형식 예시는 template의 주석 안에 둔다. 주석 밖에 두면 GitHub compose box에 채워져 실제 PR body에 그대로 남는다.
- PR body는 H1 두 개를 쓰므로 `.claude/rules/markdown.md`의 헤더 규칙과 충돌한다. 예외를 template 안에 명시해 agent가 헤더를 H2로 되돌리지 않게 한다.

관련 결정은 [규칙 문서는 도구 중립으로 쓰고 상시 로드 비용으로 정리한다](2026-07-agents-md-tool-neutral.md)를 참조한다.
