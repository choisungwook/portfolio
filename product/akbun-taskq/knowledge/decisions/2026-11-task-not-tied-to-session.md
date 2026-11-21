---
type: Decision
title: A task is never tied to a session; a new run is told what the last one did
description: Retry always starts a new session and the run dialog has no resume command; the last run's outcome, summary and tool calls go into the new run's prompt instead.
tags: [tasks, sessions, runs]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T12:00:00Z }
---

## 결정

- 0.35.0부터 재시도(`POST /tasks/:id/retry`, `taskq retry`)는 언제나 새 세션으로 시작한다. `resume` 옵션과 작업 상세의 "Resume previous session", 실행 기록 창의 `claude --resume` 복사는 없앴다.
- 대신 새 run의 프롬프트에 그 task의 직전 run의 결과, 요약, 마지막 도구 호출 8개(저장할 때 가린 그대로)를 "이미 한 일"로 넣는다(`previousRun`, `src/runner/context.ts`).
- 로그인이 만료되어 멈춘 `needs_auth` task를 Resume이나 직접 실행으로 이어 가는 것은 그대로 그 실행의 세션을 쓴다. 한 run이 끊긴 자리에서 이어지는 것이지 task가 세션을 갖는 것이 아니다.

## 이유

- task는 bot이 가져가는 하나의 객체이고, 세션은 그 task를 돌린 쪽(bot 또는 runner)의 것이다. bot의 세션은 다른 일로 계속 이어지므로, 세션을 resume하면 task가 다른 대화 한가운데로 들어간다. 사용자가 이 관계를 버그로 지적했다.
- 그렇다고 직전 시도를 잊으면 같은 일을 반복한다. 대화 전체 대신 결과와 마지막 호출만 넘기면 비용이 거의 들지 않고 세션과도 무관하다.
