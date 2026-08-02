---
type: Decision
title: 핸즈온은 terraform으로 기반까지만 만들고 학습 대상은 console에서 조작한다
description: AWS 핸즈온에서 terraform의 범위를 기반 리소스로 한정하고, 배우려는 동작은 console에서 직접 수행하기로 한 결정과 그 비용.
tags: [aws, terraform, handson]
timestamp: 2026-08-02T00:00:00Z
---

## 결정

AWS 핸즈온에서 terraform은 학습 대상이 올라갈 자리까지만 만든다. 정작 배우려는 조작은 console에서 손으로 한다.

ECS quickstart 핸즈온의 경우 cluster, task definition, container instance, IAM, security group까지를 terraform으로 만들고, service 생성과 자동 복구 관찰과 rolling 배포는 console에서 수행한다.

## 이유

핸즈온의 목적은 재현이 아니라 이해다. terraform이 전부 만들어 주면 apply 한 번으로 결과만 남고, 어떤 선택지가 있었는지가 보이지 않는다. service를 손으로 만들어야 launch type 선택과 네트워크 설정이 기억에 남는다.

반대로 기반 리소스는 손으로 만들 학습 가치가 낮고 실수하면 본론에 닿기 전에 지친다. 그래서 경계를 "배울 것"과 "배울 것이 서 있을 자리"로 나눈다.

## 비용

console에서 만든 리소스는 terraform state 밖에 있다. 그래서 세 가지를 잃는다.

- drift를 감지하지 못한다. terraform plan은 그 리소스의 변경을 보지 못한다.
- 설정 변경을 terraform으로 못 한다. ECS Exec을 켜려 할 때 aws_ecs_service가 state에 없어 CLI로만 켤 수 있었다.
- cleanup 순서가 강제된다. console 리소스를 먼저 지우지 않으면 destroy가 종속성에서 실패한다.

이 비용은 실습에서는 감수할 만하지만 운영 환경에는 그대로 옮기지 않는다. 실무에서는 service까지 IaC가 관리해야 drift를 잡는다.
