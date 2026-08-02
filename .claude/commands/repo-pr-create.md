---
description: 기록용 Issue와 PR을 만든다. root issue의 하위로 걸고 템플릿을 따른다
allowed-tools: Bash, Read, Glob, Grep
---

현재 branch의 작업을 Issue와 PR로 만든다.

## 순서

1. `git status`와 `git diff origin/master...HEAD`로 변경을 확인한다.
2. commit할 변경이 남아 있으면 commit한다. commit message에 claude session 링크(claude.ai/code 링크, Co-Authored-By 아래 붙는 세션 URL)가 있으면 제거한다.
3. push한다.
4. 이번 작업의 root issue를 정한다. `product/<이름>`을 건드렸으면 그 product, `.claude`나 `.github`면 저장소 규칙과 도구, 나머지는 핸즈온이다. `gh issue list --label root --state open`으로 찾고 없으면 만든다.
5. 기록용 Issue를 만든다. [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따라 Goal과 ADR을 채운다.
6. 5의 Issue를 4의 root issue 하위로 건다. sub-issue API 호출 형식은 [.claude/rules/workflow.md](../rules/workflow.md)에 있다.
7. root issue와 새 Issue를 project에 담는다. scope 부족으로 실패하면 안내만 하고 넘어간다.
8. PR을 만든다. [.github/pull_request_template.md](../../.github/pull_request_template.md)를 읽고 그 섹션과 형식을 그대로 따른다. 본문 끝에 Issue #<number> 형식으로 5의 Issue를 링크한다. target branch는 master다.
9. Issue와 PR에 작업 유형 label(feat, docs, fix 등)과 기술 label을 함께 붙인다.

## 작성 규칙

- commit message는 영어로, Issue와 PR body는 한글 개조식으로 쓴다. 종결어미(-다, -한다, -했다)를 쓰지 않고 명사나 -음, -함으로 끝낸다.
- Goal은 번호 리스트 3개 이내로 쪼갠다. 근거는 마크다운 리스트 최대 1개다. backtick을 쓰지 않는다.
- 목표와 의사결정은 Issue에만 쓴다. PR에는 다시 쓰지 않고 링크만 남긴다.
- PR에는 구현하면서 어려웠던 점과 감수하는 리스크를 쓴다. 쓸 내용이 없는 섹션은 헤더째 지운다.
- PR body와 Issue body 어디에도 claude session 링크를 넣지 않는다.
- 나머지는 [.claude/rules/workflow.md](../rules/workflow.md)를 따른다.
