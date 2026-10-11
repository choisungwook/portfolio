---
type: Decision
title: scaling 알림은 alarm 상태 변화와 scaled-to-max 두 EventBridge rule로 SNS에 보낸다
description: Application Auto Scaling은 max에 막혔을 때만 이벤트를 내고 target tracking alarm에는 action을 붙일 수 없다
tags: [ecs, autoscaling, eventbridge, sns]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- rule 1: `CloudWatch Alarm State Change` 중 alarm 이름이 `TargetTracking-service/<cluster>/<service>-`로 시작하고 상태가 `ALARM`인 것.
- rule 2: `aws.application-autoscaling`의 `Application Auto Scaling Scaling Activity State Change` 중 `resourceId`가 이 service인 것.
- 둘 다 SNS topic 하나로 보낸다. 메일 구독은 `alert_email` 변수가 있을 때만 만든다.

## 이유

- Application Auto Scaling의 EventBridge 이벤트는 scaled-to-max 하나뿐이라 그것만으로는 max 미만 scaling을 놓친다.
- target tracking alarm은 Application Auto Scaling 소유라 직접 alarm action을 붙이면 policy 갱신 때 덮어써진다.
- 버린 대안: CloudTrail `UpdateService` API 호출 이벤트. EventBridge로 받으려면 CloudTrail trail이 필요해 실습 리소스가 늘어난다.
- 실측: scale-out 때 두 rule 모두 `Invocations` 1, `FailedInvocations` 0, SNS `NumberOfMessagesPublished` 2.

## Citations

1. Application Auto Scaling events, Amazon EventBridge reference (docs.aws.amazon.com/eventbridge/latest/ref/events-ref-application-autoscaling.html)
