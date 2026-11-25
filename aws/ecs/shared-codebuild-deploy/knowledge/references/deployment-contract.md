---
type: Reference
title: AWS 동작 근거와 구현 계약
description: 공식 문서에서 확인한 배포 상태와 CLI 모델의 요약 사본
source: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Deployment.html
generated: { by: claude-code/unknown, at: 2026-10-04T00:00:00Z }
sources:
  - id: src-1
    resource: "https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Deployment.html"
    title: "Deployment API"
  - id: src-2
    resource: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html"
    title: "Circuit breaker"
  - id: src-3
    resource: "https://docs.aws.amazon.com/cli/latest/reference/ecs/register-task-definition.html"
    title: "RegisterTaskDefinition CLI"
  - id: src-4
    resource: "https://docs.aws.amazon.com/codepipeline/latest/userguide/action-reference-CodeBuild.html"
    title: "CodeBuild action"
  - id: src-5
    resource: "https://docs.aws.amazon.com/cli/latest/reference/ecs/wait/services-stable.html"
    title: "wait services-stable"
  - id: src-6
    resource: "https://docs.aws.amazon.com/service-authorization/latest/reference/list_ecs.html"
    title: "ECS IAM action 표"
---

# AWS 동작 근거와 구현 계약

- ECS rolling deployment는 IN_PROGRESS에서 시작하고 steady state에 도달하면 COMPLETED.
- Circuit breaker 실패는 FAILED. 자동 rollback에는 이전 COMPLETED 배포가 필요.
- RegisterTaskDefinition 응답에 등록된 taskDefinitionArn 포함.
- `aws ecs wait services-stable`은 deployments 1개와 runningCount=desiredCount만 확인. rolloutState는 보지 않음.
- CodeBuild action 입력 아티팩트 1~5개, 출력 0~5개 허용.
- ECS RegisterTaskDefinition은 task-definition ARN 수준 제한 지원.
