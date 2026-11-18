---
type: Decision
title: Workflows are step graphs a bot executes and taskq judges
description: A workflow is an n8n-like graph of steps; a bot does the work and reports each step, taskq enforces order and evidence and decides success, and runs keep a snapshot so a deleted workflow stays in the history.
tags: [bots, workflows]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T23:00:00Z }
---

## 결정

- workflow는 단계 그래프다. 단계 종류는 실행(`do`), 검증(`check`), 다른 bot에 넘김(`handoff`), 사용자 승인(`approval`)이고 `needs`로 순서를 정한다. 고리는 거부한다.
- 단계를 실행하는 것은 taskq가 아니라 bot이다. task에 `workflow_id`를 두고 owner bot이 `start_task`하면 실행이 시작되고, bot은 `workflow_step`으로 단계마다 보고한다.
- 성공은 taskq가 판정한다. 검증 단계는 증거(명령과 출력) 없이 성공할 수 없고, 승인 단계는 사용자만 닫으며, 단계 하나가 실패하면 실행이 실패한다. 실행이 성공하지 않은 task를 bot이 done이나 review로 닫는 것은 거부한다.
- 실행은 시작할 때의 정의를 복사(snapshot)한다. workflow 삭제는 soft delete이고, 실행 기록에는 "삭제됨"이 남으며 그 workflow를 실행 중인 bot에게 메시지를 보낸다.
- bot 없이 workflow만 지정된 task는 큐가 실행하지 않는다.

## 이유

- 사용자가 원한 것은 n8n처럼 순서를 그리고, Argo처럼 누가 언제 실행했는지와 진짜 성공 여부를 보는 것이었다. 단계마다 별도 실행 엔진을 두면 bot의 권한, 게이트, 예산과 따로 노는 두 번째 실행 경로가 생긴다. bot이 자기 도구로 일하고 taskq는 순서와 판정만 맡으면 기존 경계가 그대로 적용된다.
- LLM은 끝나지 않은 일을 끝났다고 보고할 수 있다. 성공을 bot의 말이 아니라 단계 상태와 증거로 정하면, 그 착오가 task 완료로 이어지지 않는다. 증거 내용의 진위까지는 검사하지 않으므로 검증 단계의 출력을 사람이 읽을 수 있게 남긴다.
- snapshot이 없으면 실행 중에 workflow를 고치거나 지웠을 때 기록이 무엇을 실행했는지 잃는다. Argo가 실행에 정의를 고정하는 것과 같은 이유다.
- 큐의 일회성 실행은 bot 세션이 없어서 단계를 보고할 주체가 없다. 조용히 단계를 무시하고 실행하는 대신 실행하지 않고 bot을 지정하라고 안내했다.

관련: [Bots work on their own tasks](2026-11-bots-execute-tasks.md), [operations for the CLI and MCP](2026-11-operations-for-cli-and-mcp.md)
