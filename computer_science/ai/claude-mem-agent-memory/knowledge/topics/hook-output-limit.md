---
type: Topic
title: SessionStart additionalContext는 10,000자를 넘으면 모델에 전달되지 않는다
description: Claude Code는 hook 출력이 10,000자를 넘으면 파일로 저장하고 앞부분 약 2KB 미리보기만 넣으며, 한도는 바이트가 아니라 글자 수 기준이다.
tags: [claude-code, hook, context]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T12:00:00Z }
sources:
  - id: claude-mem-budget
    resource: https://github.com/thedotmack/claude-mem/blob/c1dc252bda98b1310ba3fa4b195efe49070d554b/src/services/context/ContextBudget.ts
    title: claude-mem ContextBudget.ts
---

# SessionStart additionalContext는 10,000자를 넘으면 모델에 전달되지 않는다

Claude Code 2.1.327에서 `scripts/context_limit.py`로 확인했다. `additionalContext` 맨 끝에 표식을 둔 경우 9,900자는 전달되고 10,100자는 전달되지 않았다. 채움 문자를 한글로 바꿔도(9,900자, UTF-8 약 29,700바이트) 같은 결과라 한도는 글자 수 기준이다. 한도를 넘으면 모델은 "persisted-output" 형태의 파일 경로와 앞부분 미리보기만 받고, hook은 성공으로 보고된다[^claude-mem-budget].

메모리 주입처럼 시간이 지나며 커지는 hook 출력은 개수가 아니라 렌더링한 글자 수로 예산을 잡는다. 한도를 넘더라도 앞부분은 남으므로 가장 중요한 내용을 앞에 둔다. minimem은 `minimem/context.py`의 `CONTEXT_MAX_CHARS = 9000`으로 반영했다.
