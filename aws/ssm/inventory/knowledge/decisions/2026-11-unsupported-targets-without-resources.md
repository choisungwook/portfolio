---
type: Decision
title: ECS·Lambda 불가 확인은 실제 리소스 없이 가짜 ID로 한다
description: PutInventory는 InstanceId 형식에서 먼저 거부하므로 ECS task와 Lambda를 만들지 않는다
tags: [aws, ssm, inventory, ecs, lambda]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-10T00:00:00Z }
sources:
  - id: put-inventory
    resource: https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_PutInventory.html
    title: PutInventory API Reference
  - id: fis-ecs
    resource: https://docs.aws.amazon.com/fis/latest/userguide/ecs-task-actions.html
    title: AWS FIS aws:ecs:task actions
---

## 결정

- 시나리오 4는 ECS cluster, Fargate task, Lambda 함수를 만들지 않고 그 형식의 ID 문자열로 PutInventory를 호출한다.
- Fargate task를 SSM Agent sidecar + 하이브리드 활성화로 mi- 노드로 등록하는 방식은 실습하지 않고 문서에 한계로만 남긴다.

## 이유

- InstanceId 정규식이 i- 또는 mi- 형식만 허용해 리소스 존재 여부를 보기 전에 거부된다[^put-inventory]. 실제 리소스를 만들어도 결과가 같고 비용과 정리 단계만 늘어난다.
- sidecar 등록 방식은 FIS 실험용으로 존재하지만[^fis-ecs] task 교체마다 노드가 늘어 inventory 목적과 맞지 않는다.
