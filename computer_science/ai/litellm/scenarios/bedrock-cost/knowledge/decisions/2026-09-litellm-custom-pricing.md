---
type: Decision
title: LiteLLM custom pricing은 네 단가를 모두 적는다
description: config에 단가를 하나라도 주면 기본 가격표와 병합되지 않아 빠뜨린 항목이 0으로 청구된다.
tags: [litellm, bedrock, cost]
timestamp: 2026-09-20T00:00:00Z
---

# LiteLLM custom pricing은 네 단가를 모두 적는다

## 결정

`litellm_params`에 단가를 지정할 때 `input_cost_per_token`, `output_cost_per_token`, `cache_read_input_token_cost`, `cache_creation_input_token_cost`를 항상 함께 적는다. cache 단가만 바꾸고 싶어도 input/output을 기본 가격표와 같은 값으로 다시 적는다.

## 이유

custom pricing을 하나라도 주면 Router가 그 deployment를 model_id 키로 **새 가격표 항목에 등록**하고 기본 가격표와 병합하지 않는다(`router.py`의 `_register_deployment_in_model_cost`). 적지 않은 항목은 단가가 없어 0이 되고, spend가 조용히 0으로 찍힌다.

v1.99.1에서 토큰 1000개씩으로 측정한 값이다.

| 설정 | input | output |
|---|---|---|
| 지정 없음 (기본 가격표) | $0.00300000 | $0.01500000 |
| cache 단가만 지정 | $0.00000000 | $0.00000000 |
| 네 단가 모두 지정 | $0.00330000 | $0.01650000 |

`input_cost_per_token`이 설정돼 있을 때만 `_inherit_builtin_cache_pricing`이 동작해 `cache_creation_input_token_cost_above_1hr` 같은 미지정 cache 항목을 기본 가격표에서 상속한다. cache 단가만 주면 이 상속도 걸리지 않는다.

검증은 `/model/info`로 한다. `/spend/calculate`는 provider 모델명으로 기본 가격표를 조회하므로 custom pricing이 반영되지 않는다.
