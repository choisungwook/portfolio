---
type: Decision
title: event capture와 Action Logs를 콘솔 대신 Terraform으로 만든다
description: 콘솔 버튼이 만드는 리소스는 destroy로 지워지지 않으므로 같은 이름의 log group과 rule, 전용 리소스 정책을 Terraform이 소유한다
tags: [ecs, terraform, cloudwatch, eventbridge]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- event capture는 콘솔 Event history 탭이 조회하는 이름 `/aws/events/ecs/containerinsights/<cluster>/performance`로 log group을 만들고, `aws.ecs` 이벤트 중 이 클러스터의 task, service, container-instance ARN prefix만 EventBridge rule로 보낸다.
- Action Logs는 `aws_cloudwatch_log_delivery_source`(`log_type = "ACTION_LOGS"`), destination, delivery로 `/aws/vendedlogs/ecs/action-logs/<cluster>`에 보낸다.
- 두 log group의 쓰기 권한은 전용 account-level 리소스 정책 하나에 담고, delivery와 event target이 그 정책에 `depends_on`한다. 보존은 둘 다 1일.

## 이유

- 콘솔에서 켜면 rule과 log group이 Terraform 밖에 생겨 `terraform destroy` 뒤에도 남는다.
- 리소스 정책이 없으면 CreateDelivery가 계정 공용 `AWSLogDeliveryWrite20150319` 정책에 log group을 덧붙인다. 이 수정은 destroy가 되돌리지 않는다. 전용 정책을 먼저 만들면 공용 정책은 바뀌지 않는다(apply 전후 `lastUpdatedTime` 동일로 확인).
- 콘솔 문서는 rule이 `aws.ecs` 전체를 받는다고 설명한다. 클러스터별 log group에 다른 클러스터 이벤트가 섞이지 않도록 ARN prefix로 좁혔다.
- 감수한 점: 콘솔은 자기가 만든 rule 이름으로 켜짐을 판단해서, 클러스터 Configuration 탭의 ECS events는 꺼짐으로 표시된다. Event history 조회는 정상이다.
- 버린 대안: 콘솔에서 Turn on event capture를 누른 뒤 생긴 rule을 Terraform으로 import. 이미 log group이 있을 때 Turn on이 성공하는지, 콘솔 rule이 클러스터 범위로 좁혀지는지, 해시로 만든 rule 이름을 Terraform으로 재현할 수 있는지 확인하지 못해 고르지 않았다.

## Citations

1. Amazon ECS event capture in the console (docs.aws.amazon.com/AmazonECS/latest/developerguide/task-lifecycle-events.html)
2. Getting started with Amazon ECS Action Logs (docs.aws.amazon.com/AmazonECS/latest/developerguide/action-logs-getting-started.html)
