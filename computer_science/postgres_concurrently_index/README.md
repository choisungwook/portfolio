# PostgreSQL CREATE INDEX CONCURRENTLY - 운영 중 인덱스 추가하기

## 목차

- [해결하려는 문제](#해결하려는-문제)
- [이 글을 읽고 답할 수 있는 질문](#이-글을-읽고-답할-수-있는-질문)
- [문서 구성](#문서-구성)
- [결론](#결론)
- [참고자료](#참고자료)

## 해결하려는 문제

운영 중인 서비스의 테이블에 인덱스를 새로 추가해야 하는 상황이 있습니다. 그냥 `CREATE INDEX`를 날리면 어떻게 될까요?

**테이블에 쓰기 락이 걸려서, 인덱스가 다 만들어질 때까지 모든 INSERT/UPDATE/DELETE가 멈춥니다.** 10분짜리 인덱스를 만들면 10분간 서비스가 먹통이 됩니다.

PostgreSQL은 이 문제를 해결하려고 `CREATE INDEX CONCURRENTLY` 옵션을 제공합니다. 이 핸즈온은 Docker Compose로 PostgreSQL을 띄우고, 쓰기 워크로드가 흐르는 중에 두 방식을 직접 비교합니다.

## 이 글을 읽고 답할 수 있는 질문

1. `CREATE INDEX`와 `CREATE INDEX CONCURRENTLY`는 어떤 락을 잡고, 무엇을 블로킹하나요?
2. 왜 `CONCURRENTLY`는 테이블을 두 번 스캔해야 하나요?
3. 인덱스 생성 진행 상황은 어떻게 모니터링하나요?
4. `CONCURRENTLY`가 중간에 실패하면 남는 `invalid` 인덱스는 왜 위험한가요?
5. 운영 중 인덱스를 만들 때 반드시 체크해야 하는 것은 무엇인가요?

## 문서 구성

| 문서 | 분류 | 설명 |
|------|------|------|
| [concepts.md](docs/concepts.md) | 이론 | 락 동작, 언제 써야 하는지, 모니터링 쿼리, 안 쓰면 벌어지는 일 |
| [docker-lab.md](docs/docker-lab.md) | 실습 | Docker Compose로 쓰기 부하 중 블로킹/논블로킹 인덱스 생성 재현 |

## 결론

운영 중인 테이블에 인덱스를 추가한다면 기본값은 `CREATE INDEX CONCURRENTLY`입니다. 일반 `CREATE INDEX`는 `ShareLock`으로 테이블 쓰기를 전부 막고, `CONCURRENTLY`는 `ShareUpdateExclusiveLock`으로 읽기/쓰기를 허용하면서 인덱스를 만듭니다. 대신 실패 시 `invalid` 인덱스가 남기 때문에 `pg_stat_progress_create_index`로 진행을 보고 `pg_index.indisvalid`로 사후 검증하는 습관이 필요합니다.

## 참고자료

- [PostgreSQL Documentation - CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)
- [PostgreSQL Documentation - Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [PostgreSQL Documentation - Progress Reporting](https://www.postgresql.org/docs/current/progress-reporting.html)
- [Locks acquired by CREATE INDEX CONCURRENTLY - pglocks.org](https://pglocks.org/?pgcommand=CREATE+INDEX+CONCURRENTLY)
- [The hidden cost of invalid indexes in Postgres - PostgresAI](https://postgres.ai/blog/20260106-invalid-index-overhead)
