---
type: Decision
title: revision과 circuit breaker는 콘솔이 소유하고 Terraform은 ignore_changes한다
description: 실습이 콘솔에서 바꾸는 값과 ECS가 바꾸는 가중치를 다음 apply가 되돌리지 않게 한다
tags: [ecs, terraform, blue-green, circuit-breaker]
timestamp: 2026-10-18T00:00:00Z
---

## 결정

- `aws_ecs_service.web`의 `task_definition`과 `deployment_circuit_breaker`를 `ignore_changes`에 둔다. 초기값은 정상 revision과 circuit breaker 꺼짐이다.
- `aws_lb_listener_rule.production`의 `action`을 `ignore_changes`에 둔다.
- 실패용 revision 2개는 등록만 하고 서비스에 연결하지 않는다. 같은 family라 `depends_on`으로 등록 순서를 고정한다.
- 임계치(`thresholdConfiguration`)는 Terraform에서 다루지 않는다. 콘솔이나 `aws ecs update-service`로 바꾼다.

## 이유

- 실습은 콘솔에서 revision과 circuit breaker를 바꾸는 과정 자체가 내용이다. ignore_changes가 없으면 다음 apply가 실습 중 상태를 초기값으로 되돌린다.
- blue/green 배포가 성공하면 ECS가 리스너 규칙 가중치를 바꾼다. Terraform이 그 가중치를 되돌리면 트래픽이 이전 대상 그룹으로 돌아간다.
- AWS provider 6.69의 `deployment_circuit_breaker` 블록에는 `enable`과 `rollback`만 있다. AWS CLI 2.36은 `thresholdConfiguration`과 `resetOnHealthyTask`를 받는다.
- ECS 콘솔 서비스 업데이트 문서에는 임계치 입력 항목이 없다. CLI로 `--deployment-configuration`을 넘길 때는 `strategy`와 `bakeTimeInMinutes`를 함께 넘긴다.
- 서비스를 만드는 첫 배포도 blue/green이라 apply 직후 프로덕션은 `cb-lab-green`(가중치 100)이다. 서비스의 `loadBalancers[0].targetGroupArn`은 `cb-lab-blue` 그대로라 그 직후 `terraform plan`은 No changes였다. 리스너 규칙 `action`의 ignore_changes가 이 상태를 지킨다.
- CLI로 `enable=false,rollback=true`를 보내면 ECS가 `rollback=false`로 저장한다. 목표 3의 CLI는 처음부터 `rollback=false`로 쓴다.
