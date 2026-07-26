---
description: 기록용 Issue와 PR을 만든다. 템플릿을 따르고 claude session 링크를 제거한다
allowed-tools: Bash, Read, Glob, Grep
---

현재 branch의 작업을 Issue와 PR로 만든다.

## 순서

1. `git status`와 `git diff origin/master...HEAD`로 변경을 확인한다.
2. commit할 변경이 남아 있으면 commit한다. commit message에 claude session 링크(claude.ai/code 링크, Co-Authored-By 아래 붙는 세션 URL)가 있으면 제거한다.
3. push한다.
4. 기록용 Issue를 만든다. [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따라 Goal과 ADR을 채운다.
5. PR을 만든다. [.github/pull_request_template.md](../../.github/pull_request_template.md)를 따르고 본문 끝에 Issue #<number> 형식으로 4의 Issue를 링크한다. target branch는 master다.
6. Issue와 PR에 작업 유형 label(feat, docs, fix 등)과 기술 label을 함께 붙인다.

## 작성 규칙

- commit message와 PR body는 영어로 쓴다.
- 간단명료하게 쓴다. backtick을 쓰지 않는다.
- Goal은 3문장 미만, 해결 과정은 항목으로 쓴다.
- PR body와 Issue body 어디에도 claude session 링크를 넣지 않는다.
- 나머지는 [.claude/rules/workflow.md](../rules/workflow.md)를 따른다.
