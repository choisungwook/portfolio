---
type: Decision
title: desired-count 예제를 복사해 새 workspace로 만들고 desired_count는 ignore_changes한다
description: drift 실습과 Auto Scaling 실습은 desired_count 소유자가 달라서 같은 코드에 둘 수 없다
tags: [ecs, terraform, autoscaling]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- `aws/ecs/desired-count`의 Terraform, nginx, compose를 복사해 이 workspace를 시작한다.
- `aws_ecs_service.web`에 `lifecycle { ignore_changes = [desired_count] }`를 둔다. 초기값은 `var.min_capacity`다.
- desired-count 실습 전용이던 `observe_counts` data source와 task 직접 호출용 security group rule은 지운다.

## 이유

- desired-count 예제는 콘솔 변경을 `terraform plan`의 drift로 보는 실습이라 [ignore_changes를 넣을 수 없다](../../../desired-count/knowledge/decisions/2026-10-desired-count-drift.md).
- Auto Scaling에서는 Application Auto Scaling이 desired_count를 바꾼다. ignore_changes가 없으면 다음 apply가 scale-out한 개수를 min으로 되돌린다.
- scale-out(1→3) 직후 `terraform plan -detailed-exitcode`가 0(변경 없음)을 반환하는 것으로 확인했다.
