---
type: Decision
title: Bots have no spend or usage limit; Pause is how the user stops them
description: 0.20.0 removed the bots' budgets and 0.26.0 the hourly turn limits and their Settings page; concurrency and model turns per turn come from taskq.config.json, and the handover size is fixed at 100,000 tokens.
tags: [bots, settings, budget]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:00:00Z }
---

## 결정

- 0.20.0에서 bot의 예산(하루 예산, turn당 예산, 80% 표시)을 없앴다. 비용 값 없이 끝난 turn은 0으로 기록한다. 큐가 실행하는 작업의 `maxBudgetUsd`는 남겼다. bot이 아니라 한 번 도는 작업의 상한이라 아래 장부 문제가 없다.
- 설정의 사용량 제한 페이지와 `POST /settings/limits`, `taskq api settings_limits`를 없앴다.
- 전체·bot별 시간당 turn 상한과 그것이 걸면 bot 전체를 멈추던 루프 guard를 없앴다. bot 설정의 시간당 turn 칸도 없앴다. `team_agents.hourly_turns` 열은 남아 있지만 읽지 않는다.
- 동시에 일하는 bot 수(`bots.maxConcurrentTurns`)와 turn당 모델 턴(`bots.turnMaxTurns`)은 `taskq.config.json`에서만 정한다. 새 세션으로 넘기는 대화 크기는 100,000 토큰으로 고정했다.
- 예전에 저장된 `meta.limit_*` 값은 지우지 않고 읽지도 않는다.

## 이유

- 예산은 실제 청구가 아니라 taskq가 추정한 장부였다. OpenAI와 Bedrock은 토큰에 설정 파일의 단가를 곱한 값이고, Kiro는 credit이라 0이며, 비용을 모르는 실패는 turn 예산 전액으로 적었다. 어긋난 장부로 bot 전체가 멈췄고, 사용자는 그 멈춤을 돈이 나간 것으로 읽었다. 지출을 실제로 막는 곳은 제공자 쪽 한도(AWS Budgets, OpenAI 사용 한도)다.
- 사용자가 사용량 제한 기능과 메뉴를 쓰지 않는다며 없애기를 원했다. 시간당 turn 상한은 정상적으로 오래 일하는 bot도 멈추게 했고, 그때마다 다시 켜야 했다.
- 동시 실행 수와 turn당 모델 턴은 사용량 제한이 아니라 한 턴과 기계 자원의 경계라 남겼다.
- 0.28.0에서 bot 설정의 Limits(bot별 turn당 모델 턴)도 없앴다. bot마다 다르게 둘 이유가 쓰이지 않았고, 설정 화면에서 거의 쓰지 않는 칸이 판단만 늘렸기 때문이다. 모든 bot이 `bots.turnMaxTurns` 하나를 따른다.

## 잃는 것

- 두 bot이 서로에게 답하는 루프를 taskq가 스스로 멈추지 않는다. 사용자가 사이드바의 전체 멈추기로 멈춰야 한다. 실패한 turn은 여전히 `maxAttempts` 뒤에 내려놓는다.
