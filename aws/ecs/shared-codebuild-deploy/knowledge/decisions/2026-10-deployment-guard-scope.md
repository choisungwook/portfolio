---
type: Decision
title: 배포 완료는 rolloutState를 직접 조회해 판정
description: wait services-stable 대신 PRIMARY의 rolloutState가 IN_PROGRESS를 벗어날 때까지 조회
tags: [ecs, codebuild]
timestamp: 2026-10-05T00:00:00Z
---

# 배포 완료는 rolloutState를 직접 조회해 판정

## 결정

- deploy.sh는 설계의 6단계만 수행. 컨테이너 개수·family 사전 검사 없음. 컨테이너는 1개 가정.
- `aws ecs wait services-stable`을 쓰지 않음. PRIMARY rolloutState를 15초 간격으로 조회.
- PRIMARY가 등록한 ARN이고 COMPLETED일 때만 성공. 롤백(이전 ARN)과 FAILED는 실패.
- 스크립트 자체 timeout 없음. CodeBuild build_timeout 40분이 상한.

## 이유

- 2026-10-05 실제 배포에서 `wait services-stable`이 deployments=1·running=desired 시점에 끝났지만 rolloutState는 IN_PROGRESS. 설계 원안의 6단계가 정상 배포를 실패로 판정.
- circuit breaker 롤백 뒤 PRIMARY는 이전 ARN이므로 ARN 비교만으로 성공 오판 방지.
- 사전 검사는 Pipeline마다 TASK_FILE이 고정이라 실익이 적음.

## Citations

1. [AWS 배포 동작 근거](../references/deployment-contract.md).
