# Docker Compose 핸즈온 - CONCURRENTLY가 정말 쓰기를 블로킹하지 않는가

실제로 쓰기 워크로드를 돌리면서 두 방식의 차이를 직접 보는 것이 목표입니다. Docker Compose로 PostgreSQL 16을 띄우고, 200만 건의 더미 데이터가 들어간 `orders` 테이블에 인덱스를 두 번 만들어 봅니다.

## 목차

- [사전 준비](#사전-준비)
- [실습 환경 기동](#실습-환경-기동)
- [시나리오 1 - 일반 CREATE INDEX가 쓰기를 멈추게 하는 것 확인](#시나리오-1---일반-create-index가-쓰기를-멈추게-하는-것-확인)
- [시나리오 2 - CONCURRENTLY는 쓰기를 블로킹하지 않는 것 확인](#시나리오-2---concurrently는-쓰기를-블로킹하지-않는-것-확인)
- [시나리오 3 - 진행 상황 모니터링](#시나리오-3---진행-상황-모니터링)
- [시나리오 4 - 실패한 CONCURRENTLY가 남긴 invalid 인덱스](#시나리오-4---실패한-concurrently가-남긴-invalid-인덱스)
- [정리](#정리)
- [종료](#종료)

## 사전 준비

필요한 도구는 두 가지입니다.

- Docker Desktop (Docker Compose 포함)
- 3개의 터미널 창

Docker가 설치됐는지 확인합니다.

```bash
docker --version
```

## 실습 환경 기동

저장소를 클론한 경로에서 `computer_science/postgres_concurrently_index/docker` 디렉터리로 이동합니다. Docker Compose로 PostgreSQL을 실행합니다.

```bash
cd computer_science/postgres_concurrently_index/docker
docker compose up -d
```

컨테이너가 시드 데이터 200만 건을 삽입합니다. 완료까지 10~30초 걸립니다. 로그에서 `database system is ready to accept connections`가 보이면 준비 완료입니다. `Ctrl+C`로 로그 구독을 빠져나옵니다.

```bash
docker compose logs -f postgres
```

`orders` 테이블이 준비됐는지 확인합니다. 아래 쿼리는 200만 건이 있는지 간단히 체크합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "SELECT COUNT(*) FROM orders;"
```

출력이 `2000000`이면 정상입니다. `docker-compose.yml`은 실습용 SQL 스크립트를 컨테이너의 `/sql`에 읽기 전용으로 마운트합니다. 실습 명령들은 이 경로를 참조합니다.

## 시나리오 1 - 일반 CREATE INDEX가 쓰기를 멈추게 하는 것 확인

쓰기 워크로드를 먼저 띄우고, 그 위에 블로킹 인덱스 생성을 덮어서 UPDATE가 멈추는지 봅니다.

### 터미널 1 - 쓰기 워크로드 시작

`blocking_writer.sql`은 psql의 `\watch` 메타 명령으로 매초 UPDATE를 반복합니다. 각 실행은 별개의 autocommit 트랜잭션이기 때문에 긴 트랜잭션을 만들지 않습니다. `\timing on`으로 매 실행 시간을 출력하므로 블로킹이 생기면 바로 눈에 보입니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/blocking_writer.sql
```

출력에서 `Time: 수ms`가 매초 찍히는지 확인합니다. 정상이라면 UPDATE 1회당 수 밀리초 수준입니다.

### 터미널 2 - 블로킹 인덱스 생성

워크로드가 흐르는 중에 일반 `CREATE INDEX`를 실행합니다. `orders` 테이블에 `ShareLock`이 걸립니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/create_index_blocking.sql
```

### 관찰 포인트

- **터미널 1의 `\watch` 출력이 멈춥니다.** UPDATE가 `ShareLock` 해제를 기다리고 있습니다.
- **터미널 2의 `CREATE INDEX`도 시간이 오래 걸립니다** (200만 건 기준 수 초 ~ 수십 초).
- 터미널 2에서 명령이 끝나는 순간, **터미널 1에 쌓여있던 UPDATE가 한꺼번에 실행되면서 `Time:` 값이 수 초로 치솟습니다.** 이게 운영에서 말하는 "lock 해제 시점 스파이크"입니다.

### 터미널 3 - 락 상태 확인 (선택)

인덱스 빌드가 진행되는 동안 아래 쿼리로 락 상태를 확인하면 UPDATE 세션이 `granted=false`로 대기하는 것을 볼 수 있습니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/monitor_locks.sql
```

`mode=ShareLock, granted=true`를 DDL 세션이 잡고 있고, UPDATE 세션들이 `mode=RowExclusiveLock, granted=false`로 대기하는 모습이 찍힙니다.

### 실습 후 정리

터미널 1의 `\watch`를 `Ctrl+C`로 종료합니다. 방금 만든 인덱스는 다음 시나리오 전에 삭제합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id_blocking;"
```

## 시나리오 2 - CONCURRENTLY는 쓰기를 블로킹하지 않는 것 확인

같은 워크로드를 띄우고, 이번에는 `CONCURRENTLY`로 인덱스를 만듭니다.

### 터미널 1 - 쓰기 워크로드 재시작

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/blocking_writer.sql
```

### 터미널 2 - CONCURRENTLY 인덱스 생성

`CONCURRENTLY`는 트랜잭션 블록 안에서 실행할 수 없기 때문에 `psql`에서 단일 statement로 보냅니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "CREATE INDEX CONCURRENTLY idx_orders_customer_id_concurrent ON orders (customer_id);"
```

### 관찰 포인트

- **터미널 1의 UPDATE가 전혀 멈추지 않습니다.** `Time:`은 계속 밀리초 수준입니다.
- **터미널 2의 CONCURRENTLY는 시나리오 1보다 오래 걸립니다.** 테이블을 두 번 스캔해야 하기 때문입니다.
- 대신 그동안 서비스가 살아있습니다. 트레이드오프가 명확합니다.

## 시나리오 3 - 진행 상황 모니터링

`CONCURRENTLY`는 오래 걸리기 때문에 진행률을 확인하는 게 중요합니다. 시나리오 2에서 터미널 2가 실행 중일 때, 새 터미널에서 아래 명령을 반복 실행합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/monitor_progress.sql
```

psql의 `\watch`로 2초 간격 갱신도 가능합니다.

```bash
docker exec -it pg-concurrently-lab psql -U lab -d labdb -c "\
SELECT pid, phase, blocks_done, blocks_total, \
  ROUND(100.0 * blocks_done / NULLIF(blocks_total, 0), 2) AS pct \
FROM pg_stat_progress_create_index; \
\watch 2"
```

`phase` 컬럼이 아래 순서로 바뀌는 것을 볼 수 있습니다.

1. `initializing` → 메타데이터 등록
2. `building index` → 1차 빌드
3. `waiting for writers before validation` → 진행 중인 트랜잭션 대기
4. `index validation: scanning index` → 2차 검증
5. `waiting for old snapshots` → 오래된 스냅샷 종료 대기
6. (뷰에서 사라짐) → 완료

`blocks_done / blocks_total`로 1차 빌드의 진행률을 퍼센트로 볼 수 있습니다. 테이블이 작으면 1차 빌드가 금방 끝나서 뷰에 찍히는 시간이 짧습니다.

시나리오가 끝나면 터미널 1의 `\watch`를 종료하고 인덱스를 정리합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "DROP INDEX CONCURRENTLY IF EXISTS idx_orders_customer_id_concurrent;"
```

## 시나리오 4 - 실패한 CONCURRENTLY가 남긴 invalid 인덱스

UNIQUE 제약을 위반하는 상황을 의도적으로 만들어 `CONCURRENTLY`가 실패했을 때 남는 invalid 인덱스를 확인합니다.

### 중복 데이터 확인

`customer_id`에 중복이 있는 상태에서 UNIQUE 인덱스를 만들려고 하면 실패합니다. 먼저 중복이 있음을 확인합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 1 LIMIT 3;"
```

`customer_id`가 `0~100000` 범위에서 랜덤 생성됐기 때문에 200만 행 기준 평균 20회씩 중복됩니다.

### UNIQUE CONCURRENTLY 인덱스 생성 시도

아래 명령은 중복 때문에 실패합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "CREATE UNIQUE INDEX CONCURRENTLY idx_orders_customer_unique ON orders (customer_id);"
```

`ERROR:  could not create unique index ... Key (customer_id)=(...) is duplicated.` 메시지가 출력됩니다.

### invalid 인덱스 확인

실패한 인덱스는 `indisvalid=false`로 테이블에 남아있습니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/check_invalid_index.sql
```

`idx_orders_customer_unique`가 `indisvalid=false`로 조회됩니다.

### 왜 이게 위험한가

invalid 인덱스는 쿼리 플래너가 사용하지 않지만 **DML은 여전히 이 인덱스를 업데이트합니다.** 즉,

- 모든 `INSERT/UPDATE/DELETE`가 불필요한 인덱스 쓰기를 발생시킴
- 디스크 공간 차지
- 다음 `pg_upgrade`에서 에러 원인

### 복구

실습 환경에서는 바로 지웁니다. 운영에서는 반드시 `DROP INDEX CONCURRENTLY`를 써야 `SELECT`까지 막히지 않습니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -c "DROP INDEX CONCURRENTLY idx_orders_customer_unique;"
```

다시 invalid 인덱스가 없는지 확인합니다.

```bash
docker exec -it pg-concurrently-lab \
  psql -U lab -d labdb -f /sql/check_invalid_index.sql
```

행이 0개면 정상입니다.

## 정리

이 실습에서 확인한 것은 네 가지입니다.

| 시나리오 | 핵심 |
|----------|------|
| 시나리오 1 | `CREATE INDEX`는 `ShareLock`으로 UPDATE를 전부 멈춤 |
| 시나리오 2 | `CREATE INDEX CONCURRENTLY`는 UPDATE와 공존 |
| 시나리오 3 | `pg_stat_progress_create_index`로 phase와 블록 진행률 확인 가능 |
| 시나리오 4 | 실패한 `CONCURRENTLY`는 invalid 인덱스를 남기므로 사후 검증 필요 |

**운영에서는 기본값을 `CONCURRENTLY`로 두고, 진행 모니터링과 invalid 인덱스 체크를 한 세트로 묶어서 쓰는 것이 안전합니다.**

## 종료

실습 환경을 내립니다.

```bash
docker compose down -v
```

`-v` 플래그를 붙이면 볼륨까지 삭제되어 다음에 다시 띄울 때 시드 데이터가 새로 생성됩니다.
