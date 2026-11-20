---
type: Decision
title: Bots have no usage limit; Pause is how the user stops them
description: 0.26.0 removed the hourly turn limits and the Settings page that edited them; concurrency, model turns per turn and handover size come from taskq.config.json.
tags: [bots, settings]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-20T00:00:00Z }
---

## 결정

- 설정의 사용량 제한 페이지와 `POST /settings/limits`, `taskq api settings_limits`를 없앴다.
- 전체·bot별 시간당 turn 상한과 그것이 걸면 bot 전체를 멈추던 루프 guard를 없앴다. bot 설정의 시간당 turn 칸도 없앴다. `team_agents.hourly_turns` 열은 남아 있지만 읽지 않는다.
- 동시에 일하는 bot 수(`bots.maxConcurrentTurns`)와 turn당 모델 턴(`bots.turnMaxTurns`, bot별 값 우선)은 `taskq.config.json`에서만 정한다. 새 세션으로 넘기는 대화 크기는 100,000 토큰으로 고정했다.
- 예전에 저장된 `meta.limit_*` 값은 지우지 않고 읽지도 않는다.

## 이유

- 사용자가 사용량 제한 기능과 메뉴를 쓰지 않는다며 없애기를 원했다. 시간당 turn 상한은 정상적으로 오래 일하는 bot도 멈추게 했고, 그때마다 다시 켜야 했다.
- 동시 실행 수와 turn당 모델 턴은 사용량 제한이 아니라 한 턴과 기계 자원의 경계라 남겼다.

## 잃는 것

- 두 bot이 서로에게 답하는 루프를 taskq가 스스로 멈추지 않는다. 사용자가 사이드바의 전체 멈추기로 멈춰야 한다. 실패한 turn은 여전히 `maxAttempts` 뒤에 내려놓는다.
