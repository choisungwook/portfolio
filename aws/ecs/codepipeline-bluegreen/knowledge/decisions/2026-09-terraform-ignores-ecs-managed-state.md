---
type: Decision
title: terraform은 ECS가 배포마다 바꾸는 상태를 ignore_changes로 둔다
description: listener rule의 action과 서비스의 task_definition, load_balancer는 ECS와 파이프라인이 바꾸므로 terraform이 되돌리지 않게 한다
tags: [ecs, terraform, alb]
timestamp: 2026-09-14T00:00:00Z
---

## 결정

- aws_lb_listener_rule(production, test): lifecycle ignore_changes = [action]
- aws_ecs_service: lifecycle ignore_changes = [task_definition, load_balancer]

## 이유

- ECS 네이티브 blue/green은 배포가 끝나면 listener rule의 forward 대상을 다른 target group으로 바꾼다. terraform이 rule을 원래 blue target group으로 되돌리면 production 트래픽이 이미 비워진 쪽으로 간다.
- 서비스의 target group과 alternate target group 짝도 배포마다 ECS가 바꾼다. terraform-provider-aws issue 45678이 이 drift를 다룬다.
- task_definition은 파이프라인이 새 revision으로 바꾼다. [환경변수 변경도 config 파이프라인으로](2026-09-config-pipeline-not-terraform.md)와 같은 이유다.
- 대가로 ALB 라우팅과 서비스의 load balancer 설정을 terraform으로 고치려면 taint나 수동 수정이 필요하다. 실습에서는 초기 생성만 terraform이 하면 되므로 감수한다.

## Citations

1. https://github.com/hashicorp/terraform-provider-aws/issues/45678
