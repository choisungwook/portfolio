---
type: Topic
title: guardrail 비용은 검사 횟수 × 누적 문자 수로 커진다
description: text unit은 문자 기준이라 멀티턴 전체 검사와 스트리밍 반복 검사가 비용을 배수로 키운다
tags: [bedrock, guardrails, cost]
timestamp: 2026-11-07T00:00:00Z
---

- text unit은 1,000자 단위 올림이고 유료 정책마다 따로 과금된다. 토큰과 모델 가격은 무관하다.
- gateway가 비용을 키우는 경로는 둘이다. 멀티턴 요청에서 대화 전체를 매번 보내는 것(10턴 3,000자에서 4 unit vs 마지막 메시지만 1 unit), 스트리밍에서 N청크마다 누적 텍스트를 다시 보내는 것(149청크 응답에 30회 호출).
- CloudWatch 버전 차원 `TextUnitCount`는 무료 정책까지 더한 값이라 비용 계산에 쓰면 과대 계상된다. 정책 차원 값을 쓴다.
- LiteLLM spend에는 guardrail 비용이 없다. 관련: [decisions/2026-11-litellm-guardrail-defaults.md](../decisions/2026-11-litellm-guardrail-defaults.md)
