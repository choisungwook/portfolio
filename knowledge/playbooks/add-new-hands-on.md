---
type: Playbook
title: 새 핸즈온 추가 절차
description: 새 핸즈온 문서를 추가할 때 worktree 생성부터 PR과 기록용 Issue 작성까지의 표준 절차.
tags: [workflow, hands-on]
timestamp: 2026-07-10T00:00:00Z
---

## 절차

1. worktree를 생성한다. branch 이름은 `<type>/<short-description>` 형식이다.
2. 주제 디렉터리를 만들고 `README.md`는 문서 링크 허브로만 쓴다. 실습 절차는 `docs/`에 시나리오별 Markdown으로 분리한다.
3. 문서는 A4 1장을 목표로 쓴다. 결론을 먼저 3문장 이내로 쓴다.
4. 루트 `README.md` 목차에 `{번호}. {주제} ({작성날짜}) - [링크](...)` 형식으로 추가한다.
5. commit 1개로 합쳐 push하고, PR과 기록용 Issue를 함께 만든다. Issue 작성 시점은 [기록용 Issue는 PR 생성 시점에 작성](../decisions/2026-07-issue-at-pr-time.md)을 따른다.
6. 작업에서 남길 만한 결정이나 통찰이 있으면 `knowledge/`에 concept로 기록한다.

세부 규칙은 [.claude/rules/workflow.md](../../.claude/rules/workflow.md)를 따른다.
