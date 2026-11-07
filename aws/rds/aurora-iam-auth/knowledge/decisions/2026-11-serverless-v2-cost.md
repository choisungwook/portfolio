---
type: Decision
title: 실습 DB는 Aurora Serverless v2 0.5~2 ACU로 둔다
description: provisioned 최저 사양보다 싸고, IAM 인증의 여유 메모리 요구를 최대 ACU로 받는다
tags: [aurora, cost]
timestamp: 2026-11-07T00:00:00Z
---

## 결정

- writer 1대를 `db.serverless`, `min_capacity = 0.5`, `max_capacity = 2`로 만든다. 엔진은 `aurora-mysql` default 버전을 data source로 고른다.
- `min_capacity = 0`(자동 일시 중지)은 쓰지 않는다.

## 이유

- 서울 단가로 0.5 ACU는 $0.10/h, 같은 엔진의 provisioned 최저 사양 `db.t4g.medium`은 $0.113/h였다.
- IAM DB 인증은 300~1000 MiB의 여유 메모리를 요구하고 0.5 ACU는 약 1 GiB라서 최대값을 2로 둔다. 실측 ACU는 처음 15분 2, 이후 0.5였다.
- prober가 1초마다 접속하므로 자동 일시 중지는 일어나지 않고, 재개 지연이 전환 측정을 흐린다.
