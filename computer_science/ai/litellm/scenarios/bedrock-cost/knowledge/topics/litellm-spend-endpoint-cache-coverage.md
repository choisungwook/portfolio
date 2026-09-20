---
type: Topic
title: LiteLLM 집계 엔드포인트별 캐시 노출 범위
description: /spend/* 계열은 spend만 더하고 캐시 토큰은 /*/daily/activity 계열에서만 나온다.
tags: [litellm, cost, api]
timestamp: 2026-09-20T00:00:00Z
---

# LiteLLM 집계 엔드포인트별 캐시 노출 범위

한 계열만 보고 "집계에 반영되지 않는다"고 단정하지 않는다. 같은 기능을 세 계열이 다르게 노출한다.

| 엔드포인트 | OSS 동작 | 캐시 노출 |
|---|---|---|
| `/global/spend/report`, `/user/spend/report`, `/team/spend/report` | Enterprise 라이선스 요구로 실패 | 없음 |
| `/spend/logs`, `/spend/calculate` | 동작 | spend 합계만, 캐시 분해 없음 |
| `/user/daily/activity`, `/team/daily/activity`, `/tag/daily/activity` | 동작 | `total_cache_read_input_tokens`, `total_cache_creation_input_tokens`, `total_prompt_caching_savings_spend` |

- 요청 한 건의 캐시 비용 내역은 spend log의 `metadata.cost_breakdown`에 `cache_read_cost`, `cache_creation_cost`로 있다. `LiteLLM_SpendLogs` 컬럼에는 없다.
- `/spend/calculate`는 provider 모델명으로 기본 가격표를 조회하므로 config의 custom pricing이 반영되지 않는다. 설정값 확인은 `/model/info`로 한다.
- Bedrock의 CloudWatch namespace에는 캐시 토큰 지표가 `CacheReadInputTokenCount`와 `CacheWriteInputTokenCount` 둘뿐이고 금액 지표는 없다.
- v1.99.1 기준이다. 버전이 오르면 `/*/daily/activity` 응답 필드를 먼저 확인한다.
- 두 캐시의 구분은 [LiteLLM 응답 캐시와 Bedrock prompt cache는 다른 것이다](litellm-cache-vs-bedrock-prompt-cache.md)에 있다.
