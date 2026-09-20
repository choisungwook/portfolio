---
type: Decision
title: bedrock-cost 시나리오의 단가와 호출 수를 고정한다
description: 비용 비교 실험에서 단가와 호출 수가 실행 시점에 따라 흔들리지 않게 LITELLM_LOCAL_MODEL_COST_MAP=True와 num_retries 0을 쓴다
tags: [litellm, bedrock, cost]
timestamp: 2026-09-20T00:00:00Z
---

## 결정

- `scenarios/bedrock-cost/compose.yaml`에서 `LITELLM_LOCAL_MODEL_COST_MAP=True`를 준다.
- `scenarios/bedrock-cost/config.yaml`에서 `num_retries: 0`을 준다.
- 모델은 `us.`이 아니라 `global.` inference profile을 쓴다.

## 이유

- LiteLLM은 기본으로 기동할 때 GitHub main의 `model_prices_and_context_window.json`을 받아온다. 버전을 v1.99.1로 고정해도 단가는 고정되지 않는다.
- 재시도는 LiteLLM 요청 1건에 Bedrock 호출 여러 건을 만든다. 시나리오가 분리하려는 변수(응답 캐시, prompt caching, 스트림 중단)와 섞인다.
- `us.` 등 geo profile은 단가가 10% 높고, 접두사 키를 못 찾아 기본 단가로 계산되는 이슈(BerriAI/litellm #30768)가 열려 있다. `global.`은 기본 모델과 단가가 같아 단가 변수를 없앤다.

## Citations

1. litellm v1.99.1 `litellm/litellm_core_utils/get_model_cost_map.py:1-8`
2. BerriAI/litellm issue #30768
3. [scenarios/bedrock-cost/docs/4-why-different.md](../scenarios/bedrock-cost/docs/4-why-different.md)
