---
type: Decision
title: lifecycle hook은 서비스의 첫 배포를 무조건 통과시킨다
description: create-service도 같은 lifecycle을 타므로 hook이 ListServiceDeployments로 배포 수를 세어 1개 이하면 SUCCEEDED를 돌려준다
tags: [ecs, lambda]
timestamp: 2026-09-14T00:00:00Z
---

## 결정

hook Lambda는 executionDetails.serviceArn으로 ListServiceDeployments를 호출해 배포가 1개 이하면 /health 검사 없이 SUCCEEDED를 돌려준다. 그래서 Lambda role에 ecs:ListServiceDeployments가 붙어 있다.

## 이유

- 서비스 생성(create-service)도 update-service와 같은 blue/green lifecycle을 타고 hook을 부른다. aws-samples의 approval hook도 같은 방식으로 첫 배포를 구분한다.
- 초기 task definition은 public nginx라 /health가 404다. 첫 배포에서 hook이 FAILED를 돌려주면 돌아갈 blue가 없는 상태로 롤백이 시작돼 terraform apply가 깨진다.
- 초기 이미지를 public nginx로 둔 이유는 ECR이 비어 있는 상태에서도 서비스가 healthy로 뜨게 하기 위해서다. ECR 이미지를 먼저 push하려면 apply를 두 번 나눠야 한다.

## Citations

1. https://github.com/aws-samples/sample-amazon-ecs-blue-green-deployment-patterns/tree/main/ecs-bluegreen-lifecycle-hooks
