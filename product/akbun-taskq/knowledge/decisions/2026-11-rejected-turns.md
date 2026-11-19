---
type: Decision
title: A turn the provider refused is not retried and costs nothing
description: An HTTP 4xx (not 401, 403, 408 or 429) on the OpenAI Agents SDK path sets the messages aside at once with cost 0; other failures keep the retry and the whole-budget charge.
tags: [bots, openai, budget, retry]
generated: { by: claude-code/claude-fable-5-2, at: 2026-11-20T00:00:00Z }
---

## 결정

- backend가 `TurnResult.rejected`를 돌려주면 hub는 그 turn의 메시지를 `maxAttempts`와 무관하게 바로 따로 두고 알림에 원문 오류를 남긴다.
- OpenAI Agents SDK 경로(API key, Bedrock)는 HTTP 4xx 중 403, 408, 429를 뺀 응답을 `rejected`로 보고 비용을 0으로 돌려준다. 401은 기존대로 `auth_failed`다. 403은 만료된 AWS 세션일 수 있어 다시 로그인하면 풀리므로 기존대로 재시도한다.
- 비용 값 없이 실패한 그 밖의 turn(중단, crash, 5xx)은 기존대로 turn 예산 전액을 쓴 것으로 계산하고 `maxAttempts`까지 다시 시도한다.
- 하루 예산의 80%부터 사이드바에 쓴 비율을 보인다. 값은 `budgetState`가 guard와 같은 기간(자정 또는 마지막 resume 이후)의 지출로 계산한다. guard는 여기에 실행 중인 turn과 다음 turn의 예산을 더해 막으므로 100%보다 낮은 값에서 멈출 수 있다.

## 이유

- 지원하지 않는 모델 ID나 설정으로 받은 400은 같은 요청에 같은 답이 온다. 다시 시도해도 고쳐지지 않는다.
- 비용 값이 없으면 전액을 계산하는 규칙은 얼마를 썼는지 모르는 중단과 crash를 위한 것이다. 거부된 요청은 생성된 것이 없는데 이 규칙에 걸려, 재시도 몇 번이 하루 예산 $10을 장부에서 소진시키고 bot 전체를 멈췄다. 실제 청구와 장부가 어긋나 사용자가 돈이 나간 것으로 읽었다.
- 4xx가 같은 turn의 앞선 모델 호출 뒤에 오면 그 호출의 비용은 빠진다. 오류에 usage가 실려 오지 않아 알 수 없고, 거부는 대부분 첫 호출에서 온다.
- 예산은 소진된 뒤에야 알림이 떴다. 80% 표시는 멈추기 전에 한도를 올리거나 원인을 볼 시간을 준다.
