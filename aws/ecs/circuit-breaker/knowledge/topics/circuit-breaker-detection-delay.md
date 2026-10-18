---
type: Topic
title: circuit breaker의 FAILED 선언은 임계치 도달 직후가 아니라 다음 태스크 실행 뒤에 온다
description: 1단계 실패가 반복되면 ECS가 실행 간격을 늘리고, 그만큼 배포가 FAILED가 되는 시점도 늦어진다
tags: [ecs, circuit-breaker, blue-green]
timestamp: 2026-10-18T00:00:00Z
---

이미지 pull 실패(1단계)를 COUNT 2로 두 번 실행한 실측이다.

| | 1회차 | 2회차 |
| --- | --- | --- |
| 3번째 실패 → FAILED | 1분 13초 | 6분 40초 |
| 그 사이 새 태스크 실행 간격 | 35초 | 5분 7초 |
| update → FAILED | 6분 32초 | 12분 44초 |

- 두 번 모두 failureCount 3, threshold 2에서 TRIGGERED. 문서의 "같아지면 FAILED"와 다름. health check 실패(2단계)는 2에서 멈춤
- FAILED는 다음 태스크 실행 뒤에 나옴. 판단 시점이 scheduler 실행 주기에 묶인 것으로 추정
- 이미지 pull 실패 1회는 pull 7번 재시도로 90초
- 서비스 배포의 failureCount, threshold는 TRIGGERED 전까지 0으로 보임. 진행 중 실패 수는 failedTasks나 서비스 이벤트로 셈
- 첫 실패 알림은 SERVICE_DEPLOYMENT_FAILED보다 ECS Task State Change의 stopCode TaskFailedToStart가 빠름

배포 파이프라인 timeout은 이 최악 감지 시간보다 길게 잡는다. 짧으면 롤백 전에 파이프라인이 먼저 실패한다.

관련: [revision과 circuit breaker는 콘솔이 소유하고 Terraform은 ignore_changes한다](../decisions/2026-10-console-owned-circuit-breaker.md)
