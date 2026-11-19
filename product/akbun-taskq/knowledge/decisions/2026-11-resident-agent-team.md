---
type: Decision
title: Resident role agents are resumed sessions with a mailbox, and work still runs as tasks
description: Each agent is one Claude session resumed per turn; agents talk through an async mailbox, share a SQLite wiki, and only read files themselves.
tags: [team, agents, architecture]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-19T06:00:00Z }
sources:
  - id: grok-bot
    resource: https://composio.dev/content/guide-to-frok-bot
    title: A Guide to Grok Bot (third-party summary of persistent, role-based agents)
---

## 결정

- 역할 agent(lead, planner, coder, reviewer, doc-reviewer)는 계속 떠 있는 프로세스가 아니라 agent마다 하나인 Claude 세션이다. 메시지가 오면 `resume: session_id`로 그 세션을 이어 한 턴을 돌리고 끝낸다.
- agent 사이 호출은 비동기 mailbox(`team_messages`)다. 보낸 쪽은 답을 기다리지 않고, 답은 다음 턴에 새 메시지로 온다.
- 일하는 Claude bot에게 온 메시지는 다음 턴을 기다리지 않고 진행 중인 턴의 입력 stream에 넣는다(한 턴에 최대 10번). Claude Code 세션이 작업 중에 입력을 받는 것과 같다. 10번이 넘거나 stream이 없는 SDK(OpenAI)면 메시지는 큐에 남아 다음 턴에 처리되고, 그 턴은 예산과 루프 guard를 다시 거친다.
- (2026-11-18 변경) 처음에는 bot이 Read, Glob, Grep만 쓰고 실제 일을 큐 작업으로 보냈다. 지금은 bot이 자기 task를 직접 처리하고 권한은 bot마다 정한다. [bots execute tasks 결정](2026-11-bots-execute-tasks.md)을 본다.
- 장기 기억은 SQLite의 `wiki_pages`다. 쓰기는 읽은 revision을 같이 보내야 하고(낙관적 동시성), 이전 revision은 `wiki_revisions`에 남는다.
- 사용자에게 메시지를 보내는 bot은 기본으로 오케스트레이터 taskq 하나다. bot 설정에서 다른 bot에게도 허용할 수 있다.
- (2026-11-19 변경) 처음에는 팀이 기본으로 꺼져 있었다(`bots.enabled: false`). 켜는 설정을 몰라 bot이 대답하지 않는 일이 생겨, 지금은 taskq와 함께 항상 돌고 멈춤(Pause)만 둔다. 일일 예산, agent별 시간당 턴 수, 열린 작업 수, 메시지 재시도 횟수로 자동 동작의 범위를 묶는다. 예산이나 루프 상한에 걸리면 팀 전체를 멈추고 경고 하나를 띄운다.
- 메시지를 보내거나 작업을 만든 뒤 실패한 turn은 다시 돌리지 않는다. 그 메시지는 내려놓고 사용자에게 알린다.
- 시간에 맞춰 일을 시작해야 하면 `deliver_at`을 붙인 메시지를 보낸다. 받는 agent는 그 시각에 깨어난다.

## 이유

- "꺼지지 않는 세션"의 목적은 맥락이 이어지는 것이다. 프로세스를 띄워 두면 재시작, 절전, 충돌 때마다 세션이 끊기고, 쉬는 agent도 자원을 쓴다. 세션 파일을 resume하면 taskq를 다시 시작해도 대화가 이어지고, 쉬는 agent는 비용이 없다. 따라서 사용자에게는 "꺼지지 않는다"가 아니라 "대화가 끊기지 않는다"로 설명한다. 메시지 없이 스스로 깨어나지 않으므로, 나중에 할 일은 `deliver_at` 메시지로 예약한다.
- 동기 호출(A가 B의 답을 기다림)은 A와 B가 서로를 부르면 교착되고, 기다리는 동안 A의 턴 예산이 줄어든다. mailbox는 이 둘이 없고, 메시지가 DB 행이라 재시작 뒤에도 남는다.
- 처음에 bot을 읽기 전용으로 둔 이유는 상주 세션 하나가 작업 유형별 권한 프로필과 승인 절차를 우회하는 통로가 될 수 있어서였다. 사용자가 bot별 권한 설정을 원해 이 경계는 bot 설정과 항상 켜진 tamper 검사로 옮겨 갔다.
- 공유 파일 대신 SQLite를 고른 이유는 [작업 저장소 결정](2026-11-storage-sqlite.md)과 같다. 여러 agent가 같은 페이지를 동시에 고치는 경우가 생기므로 revision 비교가 필요하고, 그것은 트랜잭션 안에서 해야 한다.
- 사용자에게 오는 메시지 수를 줄이려고 lead만 말하게 했다. 경고가 많으면 아무도 보지 않는다. Grok Bot도 팀장 agent만 사용자와 대화하는 구성을 소개한다[^grok-bot].
- 이 기능의 비용은 사람이 직접 요청하지 않은 모델 호출에서 나온다. 그래서 기본값을 끔으로 두고, 켠 뒤에도 상한을 넘으면 사람이 다시 켜기 전까지 멈춘다. 상한 값(일 $10, 시간당 20턴, 열린 작업 10개, 재시도 3회, turn당 $1)은 실제 사용 기록 없이 정한 출발점이다. 하루 $10은 turn당 상한 $1로 열 번 남짓 대화하는 규모다. 시간당 20턴은 사람과 정상적으로 일하는 agent가 넘기 어렵고, 두 agent가 서로에게 답하는 루프라면 몇 분 안에 넘는 값이다. 쓰면서 `taskq team turns`의 비용을 보고 조정한다.
- 일일 예산에는 agent turn 비용뿐 아니라 agent가 owner인 작업의 실행 비용도 넣는다. 사용자가 "팀이 하루에 쓰는 돈"으로 읽는 값이 그것이기 때문이다. 동시에 시작한 turn들이 상한을 넘지 않도록 실행 중인 turn마다 turn 상한만큼 미리 잡는다. 비용을 모르는 채 끝난 turn은 turn 상한만큼 쓴 것으로 센다.
- 쓰기 뒤에 실패한 turn을 재시도하지 않는 이유는 작성 맥락이 없는 리뷰 agent가 가짜 backend로 같은 code task가 세 번 생기는 것을 재현했기 때문이다. 재시도로 얻는 것보다 같은 작업과 알림이 반복되는 비용이 크다.

## 잃는 것

- resume한 세션은 길어질수록 압축된다. 오래된 세부 사항은 wiki에 적힌 만큼만 남는다. 세션을 주기적으로 교체하는 정책은 아직 없다. 길어진 세션의 turn 비용이 커지면 `taskq team reset NAME`으로 새로 시작한다.
- 쓰기 뒤에 실패한 turn의 남은 일은 사람이 다시 보내야 한다.

## 확인 필요

- resume한 turn의 `total_cost_usd`가 그 turn의 비용인지 세션 누적인지는 실제 모델로 확인하지 않았다. 누적이면 예산 합계가 부풀려진다.
- resume한 세션에도 `tools`와 PreToolUse 거부가 그대로 걸리는지는 가짜 SDK로만 시험했다.
