---
type: Decision
title: A turn the provider refused is not retried, and bots have no spend limit
description: An HTTP 4xx (not 401, 403, 408 or 429) on the OpenAI Agents SDK path sets the messages aside at once; the daily and per-turn budgets were removed in 0.20.0.
tags: [bots, openai, budget, retry]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- backend가 `TurnResult.rejected`를 돌려주면 hub는 그 turn의 메시지를 `maxAttempts`와 무관하게 바로 따로 두고 알림에 원문 오류를 남긴다.
- OpenAI Agents SDK 경로(API key, Bedrock)는 HTTP 4xx 중 403, 408, 429를 뺀 응답을 `rejected`로 본다. 401은 `auth_failed`다. 403은 만료된 AWS 세션일 수 있어 다시 로그인하면 풀리므로 재시도한다.
- 0.20.0에서 bot의 예산(하루 예산, turn당 예산, 80% 표시)을 없앴다. 비용 값 없이 끝난 turn은 0으로 기록한다. bot을 묶는 것은 시간당 turn, turn당 모델 턴, `maxAttempts`, `session_max_tokens`다.
- 큐가 실행하는 작업의 `maxBudgetUsd`는 남겼다. bot이 아니라 한 번 도는 작업의 상한이라 아래 문제가 없다.

## 이유

- 지원하지 않는 모델 ID나 설정으로 받은 400은 같은 요청에 같은 답이 온다. 다시 시도해도 고쳐지지 않는다.
- 예산은 실제 청구가 아니라 taskq가 추정한 장부였다. OpenAI와 Bedrock은 토큰에 설정 파일의 단가를 곱한 값이고, Kiro는 credit이라 0이며, 비용을 모르는 실패는 turn 예산 전액으로 적었다. 그래서 장부가 실제와 어긋났다.
- 0.18.0에서 거부된 turn의 비용을 0으로 고치고 80% 표시를 더했지만, 어긋난 장부로 bot 전체가 멈추는 구조는 남았다. 사용자는 이 멈춤을 돈이 나간 것으로 읽었고, 기능을 없애기로 했다.
- 지출을 실제로 막는 곳은 제공자 쪽 한도(AWS Budgets, OpenAI 사용 한도)다. taskq 안에서는 turn 수와 재시도 횟수가 반복을 막는다.
