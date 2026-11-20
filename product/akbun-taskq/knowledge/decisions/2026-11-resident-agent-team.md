---
type: Decision
title: Resident bots are resumed sessions with an async mailbox, bounded by turn limits
description: Each bot is one session resumed per turn; bots talk through an async mailbox and share a SQLite wiki; they always run, and hourly turn limits, the retry limit and Pause are what stop them.
tags: [bots, agents, architecture]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
sources:
  - id: grok-bot
    resource: https://composio.dev/content/guide-to-frok-bot
    title: A Guide to Grok Bot (third-party summary of persistent, role-based agents)
---

## 결정

- bot은 계속 떠 있는 프로세스가 아니라 bot마다 하나인 세션이다. 메시지가 오면 `resume: session_id`로 그 세션을 이어 한 턴을 돌리고 끝낸다. 처음부터 있는 bot은 오케스트레이터 taskq 하나이고, 나머지는 사용자가 만든다.
- bot 사이 호출은 비동기 mailbox(`team_messages`)다. 보낸 쪽은 답을 기다리지 않고, 답은 다음 턴에 새 메시지로 온다.
- 일하는 Claude bot에게 온 메시지는 다음 턴을 기다리지 않고 진행 중인 턴의 입력 stream에 넣는다(한 턴에 최대 10번). 10번이 넘거나 stream이 없는 런타임이면 메시지는 큐에 남아 다음 턴에 처리되고, 그 턴은 루프 guard를 다시 거친다.
- 장기 기억은 SQLite의 `wiki_pages`다. 쓰기는 읽은 revision을 같이 보내야 하고(낙관적 동시성), 이전 revision은 `wiki_revisions`에 남는다.
- 사용자에게 먼저 말을 거는 bot은 기본으로 taskq 하나다(`may_message_user`). bot 설정에서 다른 bot에게도 허용할 수 있다. 사용자가 말을 건 bot은 설정과 상관없이 사용자에게 직접 답한다.
- bot은 taskq와 함께 항상 돈다. 끄는 설정은 없고 멈춤(Pause)만 있다. 자동 동작의 범위는 전체와 bot별 시간당 턴 수, 턴당 모델 턴, 열린 작업 수, 메시지 재시도 횟수로 묶는다. 시간당 턴 상한에 걸리면 bot 전체를 멈추고 경고 하나를 띄운다. 지출 한도는 두지 않는다([예산을 없앤 결정](2026-11-rejected-turns.md)).
- 메시지를 보내거나 작업을 만든 뒤 실패한 turn은 다시 돌리지 않는다. 그 메시지는 내려놓고 사용자에게 알린다.
- 시간에 맞춰 일을 시작해야 하면 `deliver_at`을 붙인 메시지를 보낸다. 받는 bot은 그 시각에 깨어난다.

bot이 task를 처리하는 방식과 권한은 [bots execute tasks 결정](2026-11-bots-execute-tasks.md)에, 길어진 세션을 새 세션으로 넘기는 것은 [session handover 결정](2026-11-session-handover.md)에 있다.

## 이유

- "꺼지지 않는 세션"의 목적은 맥락이 이어지는 것이다. 프로세스를 띄워 두면 재시작, 절전, 충돌 때마다 세션이 끊기고, 쉬는 bot도 자원을 쓴다. 세션을 resume하면 taskq를 다시 시작해도 대화가 이어지고, 쉬는 bot은 비용이 없다. 메시지 없이 스스로 깨어나지 않으므로, 나중에 할 일은 `deliver_at` 메시지로 예약한다.
- 동기 호출(A가 B의 답을 기다림)은 A와 B가 서로를 부르면 교착되고, 기다리는 동안 A의 턴이 소모된다. mailbox는 이 둘이 없고, 메시지가 DB 행이라 재시작 뒤에도 남는다.
- 공유 파일 대신 SQLite를 고른 이유는 [작업 저장소 결정](2026-11-storage-sqlite.md)과 같다. 여러 bot이 같은 페이지를 동시에 고치는 경우가 생기므로 revision 비교가 필요하고, 그것은 트랜잭션 안에서 해야 한다.
- 사용자에게 오는 메시지 수를 줄이려고 taskq만 먼저 말하게 했다. 경고가 많으면 아무도 보지 않는다. Grok Bot도 팀장 agent만 사용자와 대화하는 구성을 소개한다[^grok-bot]. 사용자가 말을 건 bot까지 taskq를 거쳐 답하게 하면 대화가 끊기므로, 설정은 bot이 먼저 말을 거는 경우만 정한다.
- 끄는 설정(`bots.enabled`)을 없앤 것은 켜는 방법을 몰라 bot이 대답하지 않는 일이 생겼기 때문이다. 대신 사람이 직접 요청하지 않은 모델 호출이 끝없이 이어지지 않도록 상한을 넘으면 사람이 다시 켜기 전까지 멈춘다. 상한 값(bot별 시간당 20턴, 열린 작업 10개, 재시도 3회)은 실제 사용 기록 없이 정한 출발점이다. 시간당 20턴은 사람과 정상적으로 일하는 bot이 넘기 어렵고, 두 bot이 서로에게 답하는 루프라면 몇 분 안에 넘는 값이다. 루프에는 bot이 둘 이상 끼므로 한 bot이 아니라 전체를 멈추고 경고도 하나만 띄운다.
- 쓰기 뒤에 실패한 turn을 재시도하지 않는 이유는 리뷰에서 가짜 backend로 같은 code task가 세 번 생기는 것을 재현했기 때문이다. 재시도로 얻는 것보다 같은 작업과 알림이 반복되는 비용이 크다.

## 잃는 것

- 쓰기 뒤에 실패한 turn의 남은 일은 사람이 다시 보내야 한다.
- resume한 세션에도 `tools`와 PreToolUse 거부가 그대로 걸리는지는 가짜 SDK로만 시험했다.
