---
type: Decision
title: A conversation over a token limit is handed over to a new session by the bot itself
description: Past session_max_tokens the hub asks the bot once for a handover note, resets the session after that turn, and delivers the note as the first message; Codex compacts itself at the same limit.
tags: [bots, sessions, tokens, cost]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- turn이 끝났을 때의 context 크기(`context_tokens`)가 `session_max_tokens`(기본 100,000, 설정에서 변경)나 모델 window의 80%를 넘으면 hub가 그 bot에게 인수인계 메모를 한 번 요청한다.
- 그 요청을 읽은 turn이 `done`으로 끝나면 세션을 비우고, bot이 `write_handover`로 남긴 메모를 새 세션의 첫 메시지로 넣는다.
- 요청을 읽은 turn은 함께 온 다른 메시지를 평소대로 처리하고 메모를 마지막에 쓴다. 요청은 따로 배달하지 않는다.
- 세션의 첫 turn에는 요청하지 않는다. 요청 표시(`team_handover:<bot>`)에는 요청한 세션 id를 함께 적고, turn을 시작하기 전에 그 세션이 아니거나 요청 메시지가 inbox에 없으면 요청과 메모를 거둔다.
- 기준은 항목 수가 아니라 토큰 수다. 모든 SDK 경로(Claude, OpenAI API key·Bedrock, Kiro)에 hub 한 곳에서 건다. Kiro는 비율만 알려 주므로 80%가 기준이다.
- Codex CLI bot은 hub가 넘기지 않고 같은 한도를 `model_auto_compact_token_limit`으로 전달해 Codex가 자기 thread를 요약하게 한다.

## 이유

- 이어지는 대화는 매 turn 전체가 다시 전송되거나(Bedrock, taskq가 이력을 보냄) 전체 기준으로 과금된다(Responses API, Claude, Kiro). 몇 주 쓴 bot은 한 줄 질문에도 과거 전체의 값을 낸다.
- 대화를 가진 것은 그 bot의 세션뿐이다. taskq가 따로 요약 모델을 부르려면 SDK마다 이력을 꺼내는 방법이 필요한데, Claude·Kiro·Responses API는 이력이 taskq 밖에 있다. bot에게 자기 세션 안에서 쓰게 하면 경로마다 구현이 갈리지 않는다.
- 메모는 `send_message`로 자신에게 보낼 수 없다. 자기 자신에게 보내는 메시지는 loop를 막으려고 10분 지연이 필수다. 그래서 요청이 있을 때만 동작하는 `write_handover`를 두었다.
- Bedrock 경로의 이력을 토큰 수로 잘라내는 방법은 택하지 않았다. 잘라낸 부분은 요약 없이 사라지고, 인수인계 turn이 요약할 맥락도 함께 잘린다. 기존 200개 상한은 그대로 둔다.
- Codex는 `turn.completed`가 turn의 모든 호출을 합산해 context 크기를 알 수 없고, 자체 compaction이 있어 그쪽에 한도만 넘긴다.
- bot이 메모를 쓰지 않으면 새 세션은 빈 채로 시작한다. 메모리와 wiki는 남는다. 요약을 강제할 수단은 두지 않았다.
- 첫 turn의 크기는 system prompt, 도구 정의, 메모리로 정해지는 그 세션의 바닥값이다. 바닥값이 한도를 넘으면 새 세션도 같은 크기로 시작하므로 요청을 반복해도 줄지 않고 turn만 쓴다.
- 요청을 단독 turn으로 배달하지 않은 것은 inbox를 한 묶음으로 넘기는 `startTurn`을 바꿔야 해서다. 대신 요청 문구가 다른 메시지를 먼저 처리하라고 적어, 사용자 메시지가 대화 전체를 아는 옛 세션에서 처리된다.
- 요청 표시에 세션 id가 없으면 사용자의 reset이나 SDK 전환 뒤에도 요청이 남아 새로 시작한 세션을 한 번 더 버린다.
