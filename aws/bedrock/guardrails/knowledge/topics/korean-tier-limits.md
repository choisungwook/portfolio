---
type: Topic
title: 한국어 guardrail은 tier와 리전에 따라 지원 범위가 갈린다
description: 서울 리전에서 grounding은 Classic으로만 돌고, word filter는 조사가 붙은 한국어 어절을 놓친다
tags: [bedrock, guardrails, korean, region]
timestamp: 2026-11-07T00:00:00Z
---

- content 필터, prompt attack, denied topic은 Standard tier에서만 한국어를 지원한다. Standard tier는 cross-region 처리가 필수라 데이터가 APAC geography 안의 다른 리전에서 처리될 수 있다. 요금은 Classic과 같다.
- contextual grounding의 Standard tier는 서울 리전에서 지원되지 않는다. 이 workspace의 grounding은 Classic tier로 동작하며 한국어는 지원 언어 밖이다. 시나리오 3의 grounding 점수가 흔들린 원인 후보다.
- word filter의 공식 지원 언어는 영어, 프랑스어, 스페인어다. `사내비밀코드`는 띄어 쓴 문장에서는 걸리고 `사내비밀코드를`에서는 걸리지 않았다. 한국어 금지어는 regex로 막는다.
- Classic tier와의 지연 비교는 측정하지 않았다.

## Citations

1. AWS Bedrock 사용자 가이드, Safeguard tiers for guardrails policies
2. AWS Bedrock 사용자 가이드, Languages supported by Amazon Bedrock Guardrails
3. Amazon Bedrock 요금 페이지, "The pricing is the same for both standard tier and classic tier."
