---
type: Decision
title: 3계정 terraform은 mock provider plan 테스트로 먼저 검증한다
description: AWS 계정 3개가 있어야 apply할 수 있어, 자격 증명 없이 도는 terraform test로 방안 조합별 표현식을 확인한다.
tags: [terraform, testing, aws]
timestamp: 2026-09-23T00:00:00Z
---

# 3계정 terraform은 mock provider plan 테스트로 먼저 검증한다

## 결정

- `terraform/tests/plan.tftest.hcl`에 `mock_provider`로 aws 3개 alias, http, random을 가짜로 두고 `command = plan`을 돌린다
- 방안 스위치를 모두 끈 조합과 모두 켠 조합 두 가지를 검사한다
- `.tf`를 고친 뒤에는 `terraform test`를 돌린다. apply는 사용자가 지시할 때만 한다

## 이유

- `validate`는 타입만 보고 값은 보지 않는다. mock plan은 리소스 인자 검증까지 해서 `validate`가 놓친 문제 두 개를 잡았다
  - ALB 이름 `litellm-mon-observability-grafana`가 32자를 넘었다
  - apply 뒤에 정해지는 ARN으로 `count`를 정해 plan이 실패했다. 켜고 끄는 bool을 따로 받도록 바꿨다
- `command = apply`까지 mock하려면 ARN 형식 값을 리소스마다 넣어야 해서 plan에서 멈춘다

## 주의

- `aws_iam_policy_document`는 mock이 임의 문자열을 만들어 IAM 리소스 검증에 걸린다. `mock_data`로 빈 정책 JSON을 기본값으로 준다
- plan 단계에서 값이 정해지지 않는 ARN·ID로 assert하면 "Unknown condition value"로 실패한다. plan에서 알 수 있는 값으로 assert한다

## Citations

1. [terraform/tests/plan.tftest.hcl](../../terraform/tests/plan.tftest.hcl)
