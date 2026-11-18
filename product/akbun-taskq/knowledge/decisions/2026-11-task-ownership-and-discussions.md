---
type: Decision
title: A task has one owner agent; several agents meet only in a bounded discussion
description: tasks.owner holds one agent per task and create_task refuses look-alike work; debates run as ordered, round-limited threads that a moderator closes.
tags: [team, agents, ownership]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T12:00:00Z }
---

## 결정

- 작업 하나에는 owner bot이 하나다(`tasks.owner`). owner만 그 작업을 시작해 처리하고, 작업을 넘기는 것은 owner와 조정 역할(오케스트레이터 taskq, planner)만 할 수 있다. 사용자는 작업 상세 화면이나 CLI에서 owner를 바꾼다.
- 작업을 만들기 전에 끝나지 않은 모든 작업과 intent를 비교한다. 글자 trigram Jaccard 유사도가 0.5 이상이면 그 작업과 owner를 알려 주며 거절하고, 다르다고 판단한 agent가 `not_duplicate_of`에 그 id를 적어야 만든다.
- 여러 agent가 같은 주제를 다뤄야 하는 경우는 작업이 아니라 토론(`team_threads`)으로 한다. 참가자 2~4명이 정해진 순서로 1~3라운드 말하고, 열어 둔 agent(moderator)가 결론을 내려 닫는다. 토론 중에는 작업을 만들지 않고, 결론 뒤 moderator가 작업을 만들거나 넘긴다.
- Board 카드에 `@owner` 배지를, Team 탭에 agent별 열린 작업과 토론 진행 상황을 보인다.

## 이유

- 사용자는 어떤 agent가 어떤 작업을 맡았는지 한눈에 봐야 한다. owner를 작업 data JSON이 아니라 열로 두어 Board, 상세 화면, Team 탭이 같은 값을 읽는다.
- 같은 요청을 lead가 planner와 coder 양쪽에 전하면 두 agent가 각자 작업을 만든다. 작업마다 sandbox 세션 하나와 비용이 들기 때문에 만들기 전에 막는다. 임베딩 없이 trigram을 쓴 이유는 [wiki 검색 결정](2026-11-wiki-hybrid-search.md)과 같고, 표현을 바꾼 같은 요청이 0.61~0.64, 무관한 요청이 0 근처로 측정되어 0.5로 잡았다. 실제 중복 사례로 다시 맞춘다.
- 토론을 막지 않은 이유는 사용자가 bot끼리 토론하는 장면도 원했기 때문이다. 다만 토론을 메시지 주고받기로 두면 두 agent가 동시에 답해 순서가 꼬이고 끝나지 않는다. 순서와 라운드를 고정하면 동시 답변이 없고 비용 상한(참가자 × 라운드 turn)이 미리 정해진다. 결론을 한 agent가 내리게 해서 토론이 작업 소유권과 섞이지 않는다.

## 잃는 것

- 유사도 검사는 단어가 많이 겹치는 서로 다른 작업을 중복으로 볼 수 있다. 그때는 agent가 `not_duplicate_of`로 넘겨야 해서 한 번 더 판단이 든다.
- 토론 중 말하지 않은 참가자는 자동으로 넘어가므로, 의견이 빠진 채 결론이 날 수 있다.
