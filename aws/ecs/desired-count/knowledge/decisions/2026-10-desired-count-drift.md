---
type: Decision
title: desired_count에 ignore_changes를 두지 않고 data source는 변수로 켠다
description: 콘솔 drift를 plan에서 보이게 하고, 실제 개수는 이름으로 참조하는 data source로 plan 시점에 읽는다
tags: [ecs, terraform]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- `aws_ecs_service.web`에 `lifecycle { ignore_changes = [desired_count] }`를 두지 않는다.
- `data "aws_ecs_service"`는 `observe_counts` 변수(기본 false)로 켜고, service를 resource 참조가 아니라 `local.service_name` 문자열로 지정한다.

## 이유

- 실습 5단계의 목적이 콘솔 변경을 `terraform plan`의 `3 -> 1` drift로 보는 것이다. ignore_changes를 두면 drift가 사라진다.
- AWS provider 6.21.0부터 data source에 `running_count`, `pending_count`가 있다. resource에는 여전히 `desired_count`만 있다.
- data source가 `aws_ecs_service.web`을 참조하면 resource에 변경이 예정된 plan에서 읽기가 apply 시점으로 미뤄져 값이 `known after apply`가 된다. 문자열 이름으로 참조해야 drift가 있는 plan에서도 현재 값을 읽는다.
- 첫 apply에서는 service가 아직 없어 data source 읽기가 실패하므로 기본값을 꺼 둔다.

## Citations

1. terraform-provider-aws CHANGELOG 6.21.0, data-source/aws_ecs_service에 running_count 추가 (hashicorp/terraform-provider-aws#44842)
