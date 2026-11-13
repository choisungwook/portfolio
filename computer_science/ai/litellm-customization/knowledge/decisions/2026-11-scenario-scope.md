---
type: Decision
title: 시나리오는 공식 기능이거나 공개 사례가 있는 것만 둔다
description: 검증되지 않은 자체 설계 시나리오를 지우고, 같은 일을 하는 공식 기능이 있으면 그것을 보여 준다
tags: [litellm, scope, hands-on]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T01:00:00Z }
---

## 결정

2026-11-14에 아래 단계를 지웠다. 새 시나리오를 더할 때도 LiteLLM 공식 문서에 있는 기능이거나 공개된 운영 사례가 있는지 먼저 확인한다.

| 지운 단계 | 이유 |
|---|---|
| 키워드 규칙 라우터 | 판정을 AI(로컬 소형 모델)로 바꿨다. 키워드 규칙은 5단계 `keyword_tier_rules`가 공식 기능으로 보여 준다 |
| 콜백 순서와 "먼저 결정한 훅이 이긴다" 표식 | 공개 사례를 찾지 못한 자체 설계 |
| `tools` 표식으로 기능 켜기 | 실제 provider에서 검증하지 않았고 공개 사례가 없다 |
| 원문을 남기지 않는 decision trail, post_call 마스킹 | 공식 `turn_off_message_logging`이 같은 문제를 다루고, 자체 구현은 사례가 없다 |
| 프리필터 → 분류 모델 → 규칙 체인과 Valkey 캐시 | 공식 `complexity_router`(키워드 규칙 → LLM 분류기 → 휴리스틱 폴백, circuit breaker)와 겹친다 |
| search_tools 코드 폴백과 Router 폴백 비교 | 비교 시나리오가 자체 설계다 |

## 이유

핸즈온의 목적은 독자가 실무에서 쓸 확장 지점을 익히는 것이다. 공식 기능이 이미 하는 일을 훅으로 다시 만들면 독자가 공식 기능을 놓치고, 사례 없는 설계는 실무 판단 근거가 되기 어렵다. custom provider(`CustomLLM`)와 `websearch_interception`은 공식 기능이라 남겼다.
