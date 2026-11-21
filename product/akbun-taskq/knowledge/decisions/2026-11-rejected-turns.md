---
type: Decision
title: A turn the provider refused is not retried
description: An HTTP 4xx (not 401, 403, 408 or 429) on the OpenAI Agents SDK path sets the messages aside at once instead of retrying.
tags: [bots, openai, retry]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:00:00Z }
---

## 결정

- backend가 `TurnResult.rejected`를 돌려주면 hub는 그 turn의 메시지를 `maxAttempts`와 무관하게 바로 따로 두고 알림에 원문 오류를 남긴다.
- OpenAI Agents SDK 경로(API key, Bedrock)는 HTTP 4xx 중 403, 408, 429를 뺀 응답을 `rejected`로 본다. 401은 `auth_failed`다. 403은 만료된 AWS 세션일 수 있어 다시 로그인하면 풀리므로 재시도한다.
- bot의 예산과 사용량 제한을 없앤 내용은 [사용량 제한 결정](2026-11-no-usage-limits.md)에 있다.

## 이유

- 지원하지 않는 모델 ID나 설정으로 받은 400은 같은 요청에 같은 답이 온다. 다시 시도해도 고쳐지지 않는다.
- 403은 만료된 AWS 세션일 수 있고 408·429는 시간이 지나면 풀리므로, 이 셋만 재시도할 가치가 있다.
