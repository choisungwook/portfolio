# 구현 명세: 시나리오가 기대하는 코드와 설정

시나리오 문서 2~5와 부록 A는 이 명세대로 구현된 환경을 전제로 명령을 적었습니다. 구현은 이 문서의 이름(파일, 엔드포인트, 환경 변수, 출력 형식)을 그대로 따릅니다. 이름이 바뀌면 시나리오 문서의 명령도 함께 고칩니다.

## 디렉터리 구조

구현 후 workspace는 아래 구조를 가집니다.

```text
computer_science/db_connection_pool/
├── compose.yaml          # postgres, app, k6, pgbouncer(profile)
├── app/                  # Spring Boot 3.x + HikariCP 5.x
├── profiles/             # 시나리오별 풀 설정 env 파일
│   ├── fixed.env
│   ├── grow.env
│   ├── timeout.env
│   └── shrink.env
├── scripts/
│   ├── watch-pool.sh     # 1초마다 풀 상태와 DB 세션 수 출력
│   └── load.sh           # k6로 동시 요청 생성
└── pgbouncer/            # 부록 A
```

## 컴포넌트 역할

| 컴포넌트 | 역할 | 포트 |
| --- | --- | --- |
| `postgres` | PostgreSQL 16. `max_connections=100` 기본값 유지 | 5432 |
| `app` | `/hold` 요청마다 커넥션을 빌려 `pg_sleep`으로 붙잡는 Spring Boot 앱 | 8080 |
| `k6` | 동시 요청 수(VU)를 고정해 `/hold`를 반복 호출 | 없음 |
| `pgbouncer` | 부록 A 전용. `--profile pgbouncer`일 때만 기동 | 6432 |

## app 요구사항

- `GET /hold?seconds=N`: `DataSource`에서 커넥션을 빌려 `SELECT pg_sleep(N)`을 실행하고 반납합니다. 응답 본문에 커넥션 획득 대기 시간(ms)을 넣습니다. 획득에 실패하면 HTTP 503과 예외 메시지를 돌려줍니다.
- JDBC URL에 `ApplicationName=pool-lab`을 붙여 DB 쪽에서 이 앱의 세션만 셀 수 있게 합니다.
- `spring-boot-starter-actuator`와 `micrometer-registry-prometheus`로 `/actuator/prometheus`를 엽니다.
- `logging.level.com.zaxxer.hikari=DEBUG`로 housekeeper의 `Before cleanup stats`, `After cleanup stats`, `Added connection`, `Closing connection` 로그를 남깁니다.
- 풀 설정은 아래 환경 변수로만 받습니다. 기본값은 HikariCP 기본값과 같게 둡니다.

| 환경 변수 | 매핑되는 HikariCP 키 |
| --- | --- |
| `HIKARI_MAXIMUM_POOL_SIZE` | `maximumPoolSize` |
| `HIKARI_MINIMUM_IDLE` | `minimumIdle` |
| `HIKARI_CONNECTION_TIMEOUT` | `connectionTimeout` |
| `HIKARI_IDLE_TIMEOUT` | `idleTimeout` |
| `HIKARI_MAX_LIFETIME` | `maxLifetime` |
| `DB_HOST`, `DB_PORT` | JDBC URL. 부록 A에서 PgBouncer로 바꿀 때 사용 |

## profiles 값

| 파일 | max | minIdle | connectionTimeout | idleTimeout | maxLifetime |
| --- | --- | --- | --- | --- | --- |
| `fixed.env` | 10 | 10 | 30000 | 600000 | 1800000 |
| `grow.env` | 10 | 2 | 30000 | 600000 | 1800000 |
| `timeout.env` | 10 | 2 | 1000 | 600000 | 1800000 |
| `shrink.env` | 10 | 2 | 30000 | 10000 | 60000 |

## scripts 요구사항

`scripts/watch-pool.sh`는 1초마다 한 줄을 출력합니다. 앞 5개 값은 `/actuator/prometheus`의 `hikaricp_connections_active`, `_idle`, `_pending`, `hikaricp_connections`(total)에서, `db`는 `pg_stat_activity`에서 `application_name='pool-lab'`인 행 수에서 읽습니다.

```text
time      active idle pending total db
12:00:01  0      2    0       2     2
```

`scripts/load.sh <vus> <hold_seconds> <duration_seconds>`는 k6 VU `<vus>`개가 `<duration_seconds>` 동안 `/hold?seconds=<hold_seconds>`를 쉬지 않고 호출하게 합니다. 끝나면 요청 수, 성공 수, 503 수, `http_req_duration`의 p50, p95, max를 출력합니다.

## 확인 필요

- `HIKARI_MINIMUM_IDLE`을 비워 "미지정" 상태를 만드는 방법은 Spring Boot 바인딩에서 빈 문자열을 어떻게 처리하는지 확인한 뒤 정합니다. 그전까지 `fixed.env`는 `minimumIdle=maximumPoolSize`로 같은 동작을 냅니다.
