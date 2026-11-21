# PostgreSQL RBAC 인증·인가 핸즈온

PostgreSQL이 MySQL 같은 계정 중심 DB와 다르게 **RBAC(Role-Based Access Control)**과 **객체 소유권(Ownership)**을 중심으로 인증·인가를 처리한다는 원리를 로컬 Docker 환경에서 직접 실험하며 익히는 핸즈온입니다.

단순히 `GRANT` 문법만 따라 치는 대신, 실무에서 가장 자주 겪는 두 가지 장애를 일부러 발생시켜 보고 복구합니다. 하나는 Flyway 마이그레이션 도구를 사용할 때 계정 소유권이 꼬여 `must be owner of table` 또는 `permission denied`가 터지는 장애와 롤백 절차이고, 다른 하나는 비밀번호 로테이션을 위해 신규 계정을 만들어 교체한 뒤 기존 계정을 지우려 할 때 `cannot be dropped because some objects depend on it`으로 막히는 장애입니다.

전체 흐름과 시나리오별 목표는 [1-overview.md](docs/1-overview.md)에서 먼저 확인하고, 슬라이드 형식으로 그림과 애니메이션을 보며 복습하려면 [study-guide.html](docs/study-guide.html)을 브라우저에서 엽니다.

## 문서 목록

| 단계 | 문서 | 다루는 내용 |
| --- | --- | --- |
| 준비 | [setup.md](docs/setup.md) | 순수 `docker` CLI 명령으로 MySQL 8.4·PostgreSQL 16 컨테이너 구축, 초기화, 정리 |
| 1 | [1-overview.md](docs/1-overview.md) | 기능 지도, MySQL vs PostgreSQL 권한 용어 대조표, 전체 시나리오 흐름 |
| 2 | [2-mysql-vs-postgres-rbac.md](docs/2-mysql-vs-postgres-rbac.md) | MySQL `user@host` 와일드카드 권한과 PostgreSQL RBAC 계층·`ALTER DEFAULT PRIVILEGES` 비교 실습 |
| 3 | [3-flyway-ownership-incident.md](docs/3-flyway-ownership-incident.md) | Flyway 소유권 장애 재현(`permission denied`, `must be owner`), 트랜잭션 DDL 롤백·보상 마이그레이션, `SET ROLE app_owner` 해결 |
| 4 | [4-password-rotation-incident.md](docs/4-password-rotation-incident.md) | 비밀번호 로테이션 계정 교체 장애(`DROP ROLE` 의존성 오류), `REASSIGN OWNED` 복구, Blue/Green Role 패턴 |
| 학습지 | [study-guide.html](docs/study-guide.html) | 생성 이미지와 인터랙티브 동작 애니메이션을 담은 HTML 슬라이드 학습지 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제와 해결 방법 |

## 코드와 자산 구성

| 경로 | 내용 |
| --- | --- |
| [scripts/setup-containers.sh](scripts/setup-containers.sh) | `docker network`와 `docker run` 명령으로 MySQL 8.4·PostgreSQL 16 컨테이너를 기동하는 스크립트 |
| [scripts/reset-postgres-db.sh](scripts/reset-postgres-db.sh) | 시나리오 간 PostgreSQL `shop` DB와 실습 Role을 초기 상태로 되돌리는 스크립트 |
| [scripts/cleanup-containers.sh](scripts/cleanup-containers.sh) | 실습 컨테이너와 Docker 네트워크를 정리하는 스크립트 |
| [flyway/](flyway/) | 읽기 쉬운 단계별 SQL 마이그레이션(`step1`~`step3`)과 보상 롤백 SQL(`rollback/V4__rollback_orders.sql`) |
| [imgs/](imgs/README.md) | Gemini 이미지 생성 모델로 만든 아키텍처 다이어그램 4장과 재생성용 프롬프트 기록 |
| [knowledge/](knowledge/index.md) | 핸즈온 설계 의사결정과 검증 기록 |
