---
type: Decision
title: PostgreSQL RBAC 핸즈온 환경 및 Flyway 시나리오 설계 결정
description: 순수 docker CLI 환경, Flyway 단계별 디렉터리 분리, 보상 마이그레이션 롤백 및 Gemini 이미지 프롬프트 기록 결정
status: accepted
date: 2026-11-21
---

## 맥락

로컬에서 MySQL 8.4와 PostgreSQL 16의 인증·인가 차이를 비교하고, Flyway 마이그레이션 소유권 장애와 비밀번호 로테이션 장애를 재현하는 핸즈온을 구성한다.

## 결정

1. **`docker compose` 대신 순수 `docker` CLI 명령으로 구축**: 컨테이너 네트워크(`pg-rbac-net`), DB(`mysql:8.4`, `postgres:16`), 일회성 Flyway(`flyway/flyway:10`) 실행 흐름을 숨기지 않고 독자가 직접 `docker run`과 `docker exec`로 제어하도록 구성했다. 셸 스크립트(`scripts/*.sh`)도 내부에서 동일한 `docker` 명령을 사용한다.
2. **Flyway 단계별 SQL 디렉터리 분리 (`step1`, `step2`, `step3`, `rollback`)**: Flyway OSS Edition에서 `-target` 옵션 호환성에 의존하지 않고 `-locations=filesystem:...` 조합만으로 V1 → V2 → V3 → V4(보상 롤백)를 명확히 재현하도록 분리했다.
3. **실행 중 실패 롤백과 커밋 후 롤백 분리 설명**: PostgreSQL 16 + Flyway 10.22.0 실측에서 V3(`CREATE TABLE inventory_logs` + `ALTER TABLE products`)가 소유권 오류(`42501`)로 실패할 때 앞선 `CREATE TABLE`까지 트랜잭션 DDL로 원자적 롤백되며 `flyway_schema_history`에 실패 행이 남지 않음을 확인했다. 이미 커밋된 V2(`orders`)의 롤백은 Flyway OSS 환경의 실무 표준인 보상 마이그레이션(`V4__rollback_orders.sql`)으로 검증했다.
4. **아키텍처 다이어그램 재생성 가능성 확보**: Gemini 이미지 생성 모델로 만든 4장의 PNG를 `imgs/`에 저장하고, 각 이미지의 원본 프롬프트를 `imgs/README.md`에 기록해 추후 일관된 스타일로 재생성할 수 있게 했다.
