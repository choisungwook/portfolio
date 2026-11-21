---
type: Decision
title: A bot's tool calls are recorded in SQLite and folded into its conversation
description: Each tool call a bot attempts is stored in team_turn_steps from the backend's own pre-call point, and the chat folds calls in a row into one line with a live spinner.
tags: [bots, ui, chat]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T00:00:00Z }
---

# A bot's tool calls are recorded in SQLite and folded into its conversation

## 결정

- bot이 turn 중에 부른 도구는 `team_turn_steps` 표에 남긴다. Claude bot은 PreToolUse hook에서, OpenAI bot은 도구를 실행하기 직전에 `TurnRequest.onStep`을 부르고, hub가 그것을 지금 turn의 행으로 쓴다. gate가 거부할 호출도 시도로 남긴다.
- 저장하는 것은 도구 이름(MCP `mcp__team__` 접두사 제거)과 사람이 알아보는 입력 하나(명령, 파일, 패턴 등)를 mask한 뒤 200자로 자른 값뿐이다. `send_message`는 메시지로 이미 보이므로 남기지 않는다.
- 대화 화면은 메시지 사이에 이어진 호출을 한 줄로 접는다. bot이 아직 그 묶음에서 일하면 점 네 개가 돌고 지금 도구와 경과 초를 보인다.
- Kiro는 kiro-cli가 별도 프로세스에서 도구를 돌려 taskq가 호출 시점을 보지 못하므로 기록하지 않는다. OpenAI bot에 붙인 MCP server 도구도 SDK runner가 직접 불러 기록되지 않는다.

## 이유

- 사용자는 bot이 대답하기 전에 무엇을 하고 있는지 보고 싶어 했다. 메모리에만 두면 taskq를 다시 켰을 때나 끝난 turn에서 과정이 사라지고, 이미 있는 대화 polling(5초)과 같은 길로 읽으면 SSE나 새 push 경로가 필요 없다.
- gate(`bot-gate.ts`)는 백엔드마다 부르는 자리가 달라 공통 기록 지점이 될 수 없었다. 그래서 백엔드가 호출 직전에 알리는 선택적 callback 하나를 `TurnRequest`에 더했다.
- 명령에 비밀이 섞일 수 있어 원문 전체가 아니라 mask한 짧은 요약만 둔다. 표는 지우지 않는다. 행이 작고, 오래된 행이 문제가 되면 그때 기간으로 지운다.
