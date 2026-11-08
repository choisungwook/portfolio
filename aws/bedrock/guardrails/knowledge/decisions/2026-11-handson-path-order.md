---
type: Decision
title: 실습은 콘솔, API, LiteLLM 순서로 같은 guardrail을 호출한다
description: 각 단계가 부르는 API를 문서에 명시하고, 콘솔 테스트에서 ApplyGuardrail 직접 호출을 거쳐 LiteLLM 연동으로 넘어간다
tags: [bedrock, guardrails, litellm, docs]
timestamp: 2026-11-07T00:00:00Z
---

## 결정

- 시나리오 2는 `## AWS 콘솔 예제`(guardrail 테스트 창)와 `## API 예제`(`aws bedrock-runtime apply-guardrail`)로 나눈다. 콘솔이 먼저다.
- API 예제 1단계는 헬퍼 함수 없이 AWS CLI 원본 명령과 응답 필드를 보여 주고, 그 뒤에 `aws_apply`가 같은 호출을 줄인 것이라고 밝힌다.
- 시나리오 3은 실습 첫머리에서 LiteLLM `POST /v1/chat/completions`를 curl로 한 번 호출해 연동을 확인한 뒤 `chat` 함수로 넘어간다.
- 시나리오 10의 단계 설명도 스크립트 이름이 아니라 호출하는 API(ApplyGuardrail, CloudWatch `get-metric-statistics`, CloudTrail `lookup-events`)로 쓴다.

## 이유

- 핸즈온의 대상은 스크립트가 아니라 guardrail API다. "스크립트를 실행한다"로 쓰면 독자가 어떤 API를 호출했는지 모른 채 결과만 보게 된다.
- 콘솔에서 눈으로 본 판정을 CLI의 ApplyGuardrail 응답 필드로 다시 읽고, 마지막에 LiteLLM이 같은 API를 부르는 모습을 본다. 같은 판정을 콘솔 → API → LiteLLM 순서로 보면, 결과가 달라졌을 때 원인을 새로 추가된 계층 하나로 좁힐 수 있다.
- 콘솔 테스트 창에는 **Use ApplyGuardrail API** 선택지가 있어 모델 없이 판정할 수 있다. 공식 문서의 테스트 절차 페이지에는 모델을 고르는 방식만 나와 있어 처음에는 빠뜨렸고, 사용자가 실제 화면에서 확인해 고쳤다. 콘솔 단계는 모델 없이 판정 → 모델을 붙인 최종 응답 순서로 둔다.
- 나머지 콘솔 메뉴 이름은 공식 문서를 따랐으므로 실제 화면과 다르면 고친다.

## Citations

1. AWS Bedrock 사용자 가이드, Test your guardrail (guardrails-test)
