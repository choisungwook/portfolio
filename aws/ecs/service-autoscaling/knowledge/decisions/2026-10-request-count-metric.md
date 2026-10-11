---
type: Decision
title: 기본 지표는 ALBRequestCountPerTarget, CPU는 ECS Exec 시나리오로 따로 둔다
description: 고정 응답 nginx로는 CPU가 오르지 않아 요청 수 지표를 쓰고, k6 요청률로 도달 개수를 미리 계산한다
tags: [ecs, autoscaling, k6]
timestamp: 2026-10-11T00:00:00Z
---

## 결정

- `ALBRequestCountPerTarget`, `target_value = 600`, `min_capacity = 1`, `max_capacity = 3`, cooldown 양쪽 60초.
- 부하는 k6 `constant-arrival-rate` 초당 30 요청(분당 1800).
- CPU 시나리오는 `scaling_metric=cpu` 변수로 policy를 바꾸고, 이미지는 그대로 두고 ECS Exec로 `yes`를 돌린다. policy는 한 번에 하나만 만든다.

## 이유

- nginx가 고정 문자열만 반환해 요청으로는 CPU가 거의 오르지 않는다. CPU를 태우는 이미지로 바꾸면 desired-count 예제와 공유하는 nginx 설정을 버려야 해서 ECS Exec를 골랐다.
- 두 policy를 함께 두면 alarm 4개가 같은 알림 rule에 걸리고 scale-in은 두 policy가 모두 동의해야 해서, 시나리오마다 무엇 때문에 scaling됐는지 읽기 어렵다.
- CPU 실측: 0.25 vCPU task에서 `yes` 하나로 100%. 부하 시작 약 5.5분 뒤 1 → 2, 새 task에도 부하를 건 뒤 2 → 3(max). CPU scale-in도 부하 종료 약 17분 뒤 3 → 2, 2분 뒤 2 → 1.
- 요청 수는 응답 시간과 무관하게 k6 요청률이 그대로 지표가 된다. `1 × 1800 / 600 = 3`으로 한 번에 max에 닿게 맞춰 `scaled-to-max` 이벤트까지 한 번의 부하로 확인한다.
- 실측: 부하 시작 약 5분 뒤 desired count 1 → 3, AlarmHigh threshold 600(3분), AlarmLow threshold 540(15분).
- 실측: alarm은 평가 시각보다 2분 23초 전에 끝난 datapoint 구간까지만 평가한다(History의 `evaluatedDatapoints`). 그래서 부하 시작부터 ALARM까지 약 5.5분 = 3분(3 out of 3) + 약 2.4분.
- 실측: 부하를 끊어도 ALB가 `0.0` datapoint를 보내 scale-in이 된다. 종료 약 17분 뒤 3 → 2, 2분 뒤 2 → 1. 그래서 scale-in용 저부하 단계를 따로 두지 않는다.
