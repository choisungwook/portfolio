---
type: Decision
title: HikariCP와 PostgreSQL로 설계하고 구현은 분리한다
description: 커넥션풀 핸즈온의 도구를 HikariCP와 PostgreSQL로 정하고, 이 workspace에는 이론과 실습 설계만 둔다.
tags: [connection-pool, hikaricp, postgresql, pgbouncer]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T00:00:00Z }
---

# HikariCP와 PostgreSQL로 설계하고 구현은 분리한다

## 결정

- 핵심 도구는 HikariCP 5.x(Spring Boot 3.x 기본 풀)와 PostgreSQL 16으로 한다. PgBouncer는 부록으로만 다룬다.
- 이 workspace에는 이론 문서, 실습 절차, 구현 명세만 둔다. 실습 코드는 다른 곳에서 구현하고, 문서의 출력은 예상값으로 표시한다.

## 이유

- HikariCP는 desired 값이 없고 `minimumIdle`이 idle 기준이라, "min/desired/max처럼 동작한다"는 직관과 실제 동작의 차이를 가장 분명하게 보여 준다.
- PostgreSQL은 `pg_stat_activity`의 `application_name`, `pid`, `backend_start`로 세션 증감과 교체를 DB 쪽에서 직접 셀 수 있고, min/default/reserve 구조를 가진 PgBouncer로 확장할 수 있다.
- 구현 전에 엔드포인트, 환경 변수, 출력 형식을 `docs/implementation-spec.md`에 고정해 두면, 구현이 다른 곳에서 진행돼도 시나리오 문서의 명령을 그대로 쓸 수 있다.
