---
type: Topic
title: LiteLLM 응답 캐시와 Bedrock prompt cache는 다른 것이다
description: 같은 "캐시"가 단가를 매길 수 없는 LiteLLM 응답 캐시와 spend에 잡히는 Bedrock prompt cache 둘을 가리킨다.
tags: [litellm, bedrock, cache, cost]
timestamp: 2026-09-20T00:00:00Z
---

# LiteLLM 응답 캐시와 Bedrock prompt cache는 다른 것이다

캐시 비용을 묻거나 답하기 전에 어느 쪽인지 먼저 정한다. 단가 설정 가능 여부와 spend 반영이 반대다.

| 구분 | LiteLLM 응답 캐시 | Bedrock prompt cache |
|---|---|---|
| 정체 | proxy가 Redis에 담아 둔 동일 요청의 응답 | provider가 prompt prefix를 재사용 |
| 판별 | 응답의 `cache_hit=True` | usage의 cache read/creation input token |
| 단가 설정 | 불가 | `cache_read_input_token_cost`, `cache_creation_input_token_cost` |
| spend | 항상 0 | 단가 × 토큰으로 계산돼 포함 |

- LiteLLM 응답 캐시는 provider를 부르지 않으므로 청구할 비용 자체가 없다. 절감 효과는 금액이 아니라 spend 0인 요청 수로 보인다.
- Bedrock prompt cache는 provider를 부르므로 일반 호출과 같은 경로로 과금된다. 단가 설정은 [LiteLLM custom pricing은 네 단가를 모두 적는다](../decisions/2026-09-litellm-custom-pricing.md)를 따른다.
- 어느 API에서 어떤 값이 나오는지는 [LiteLLM 집계 엔드포인트별 캐시 노출 범위](litellm-spend-endpoint-cache-coverage.md)에 있다.
