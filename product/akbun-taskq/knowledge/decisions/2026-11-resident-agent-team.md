---
type: Decision
title: Resident role agents are resumed sessions with a mailbox, and work still runs as tasks
description: Each agent is one Claude session resumed per turn; agents talk through an async mailbox, share a SQLite wiki, and only read files themselves.
tags: [team, agents, architecture]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T00:00:00Z }
sources:
  - id: grok-bot
    resource: https://composio.dev/content/guide-to-frok-bot
    title: A Guide to Grok Bot (third-party summary of persistent, role-based agents)
---

## 결정

- 역할 agent(lead, planner, coder, reviewer, doc-reviewer)는 계속 떠 있는 프로세스가 아니라 agent마다 하나인 Claude 세션이다. 메시지가 오면 `resume: session_id`로 그 세션을 이어 한 턴을 돌리고 끝낸다.
- agent 사이 호출은 비동기 mailbox(`team_messages`)다. 보낸 쪽은 답을 기다리지 않고, 답은 다음 턴에 새 메시지로 온다.
- agent 세션의 도구는 Read, Glob, Grep(PreToolUse hook으로 경로 제한)과 팀 MCP 도구뿐이다. 코드 수정, 명령 실행, 웹 조회는 `create_task`로 큐에 넣고, 기존 sandbox, gate, 승인 절차를 그대로 지난다. 작업이 끝나면 결과가 `assignee` agent의 inbox로 온다.
- 장기 기억은 SQLite의 `wiki_pages`다. 쓰기는 읽은 revision을 같이 보내야 하고(낙관적 동시성), 이전 revision은 `wiki_revisions`에 남는다.
- 사용자에게 메시지를 보낼 수 있는 agent는 lead 하나다.
- 팀은 기본으로 꺼져 있다(`team.enabled: false`). 켜면 일일 예산, agent별 시간당 턴 수, 열린 작업 수, 메시지 재시도 횟수로 자동 동작의 범위를 묶는다. 예산이나 루프 상한에 걸리면 팀 전체를 멈추고 경고 하나를 띄운다.

## 이유

- "꺼지지 않는 세션"의 목적은 맥락이 이어지는 것이다. 프로세스를 띄워 두면 재시작, 절전, 충돌 때마다 세션이 끊기고, 쉬는 agent도 자원을 쓴다. 세션 파일을 resume하면 taskq를 다시 시작해도 대화가 이어지고, 쉬는 agent는 비용이 없다. 대신 메시지 사이에 agent가 스스로 깨어 일하지는 않는다. 정기 작업이 필요하면 메시지를 보내는 스케줄을 따로 둔다.
- 동기 호출(A가 B의 답을 기다림)은 A와 B가 서로를 부르면 교착되고, 기다리는 동안 A의 턴 예산이 줄어든다. mailbox는 이 둘이 없고, 메시지가 DB 행이라 재시작 뒤에도 남는다.
- agent 세션에 Bash와 Edit을 주면 상주 세션 하나가 작업 유형별 권한 프로필과 승인 절차를 우회하는 통로가 된다. 일을 큐 작업으로 보내면 권한 경계가 지금과 같고, Calendar와 Board에 기록도 남는다.
- 공유 파일 대신 SQLite를 고른 이유는 [작업 저장소 결정](2026-11-storage-sqlite.md)과 같다. 여러 agent가 같은 페이지를 동시에 고치는 경우가 생기므로 revision 비교가 필요하고, 그것은 트랜잭션 안에서 해야 한다.
- 사용자에게 오는 메시지 수를 줄이려고 lead만 말하게 했다. 경고가 많으면 아무도 보지 않는다. Grok Bot도 팀장 agent만 사용자와 대화하는 구성을 소개한다[^grok-bot].
- 이 기능의 비용은 사람이 직접 요청하지 않은 모델 호출에서 나온다. 그래서 기본값을 끔으로 두고, 켠 뒤에도 상한을 넘으면 사람이 다시 켜기 전까지 멈춘다. 상한 값(일 $10, 시간당 20턴, 열린 작업 10개, 재시도 3회)은 실제 사용 기록 없이 정한 출발점이다. 쓰면서 `taskq team turns`의 비용을 보고 조정한다.

## 잃는 것

- agent가 파일을 직접 고치지 못하므로 작은 수정도 작업 하나와 세션 하나를 거친다. 느리고 작업당 비용이 더 든다.
- resume한 세션은 길어질수록 압축된다. 오래된 세부 사항은 wiki에 적힌 만큼만 남는다.
