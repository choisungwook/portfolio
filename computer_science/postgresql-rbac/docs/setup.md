# 실습 환경 구축 및 정리

이 핸즈온은 별도 오케스트레이션 도구 없이 순수 `docker` CLI 명령으로 MySQL 8.4, PostgreSQL 16, Flyway 10 컨테이너를 띄워 실습합니다. 모든 명령은 저장소 루트(`/path/to/portfolio`)에서 `computer_science/postgresql-rbac` 디렉터리로 이동해 실행하는 기준입니다.

## 사전 요구 사항

- Docker Desktop 또는 Docker Engine이 실행 중인 로컬 환경
- 로컬 포트 `13306`(MySQL)과 `15432`(PostgreSQL)가 비어 있어야 합니다.

## 컨테이너 구축 (직접 docker 명령 실행)

실습 디렉터리로 이동해 컨테이너 간 통신에 사용할 전용 Docker 네트워크를 생성합니다.

```bash
cd computer_science/postgresql-rbac
docker network create pg-rbac-net
```

MySQL 8.4 컨테이너(`rbac-mysql`)를 `pg-rbac-net` 네트워크에 연결하고 `shop` 데이터베이스를 초기화합니다.

```bash
docker run -d \
  --name rbac-mysql \
  --network pg-rbac-net \
  -p 13306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=shop \
  mysql:8.4
```

PostgreSQL 16 컨테이너(`rbac-postgres`)를 같은 네트워크에 띄우고 `shop` 데이터베이스를 초기화합니다.

```bash
docker run -d \
  --name rbac-postgres \
  --network pg-rbac-net \
  -p 15432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=pgpass \
  -e POSTGRES_DB=shop \
  postgres:16
```

두 컨테이너가 접속 가능한 상태인지 헬스체크 명령으로 확인합니다.

```bash
docker exec rbac-postgres pg_isready -U postgres -d shop
docker exec rbac-mysql mysqladmin ping -h 127.0.0.1 -uroot -prootpass --silent && echo "mysql ready"
```

정상 기동 시 아래 응답이 출력됩니다.

```text
/var/run/postgresql:5432 - accepting connections
mysql ready
```

## 스크립트로 한 번에 구축하기

위 `docker network`와 `docker run` 명령을 그대로 묶어 둔 셸 스크립트를 실행하면 두 컨테이너를 한 번에 띄우고 준비 상태까지 대기합니다.

```bash
./scripts/setup-containers.sh
```

실행이 끝나면 두 컨테이너의 이름과 포트 매핑이 출력됩니다.

```text
NAMES           IMAGE         STATUS          PORTS
rbac-postgres   postgres:16   Up 1 second     0.0.0.0:15432->5432/tcp, [::]:15432->5432/tcp
rbac-mysql      mysql:8.4     Up 27 seconds   0.0.0.0:13306->3306/tcp, [::]:13306->3306/tcp
```

## 시나리오 간 PostgreSQL 초기화

시나리오 2, 3, 4는 모두 `shop` 데이터베이스와 실습용 Role을 사용합니다. 앞 시나리오의 테이블이나 Role이 남아 있으면 다음 시나리오 결과가 달라지므로, 시나리오를 새로 시작하기 전에 아래 스크립트로 `shop` 데이터베이스와 실습 Role만 깨끗하게 초기화합니다.

```bash
./scripts/reset-postgres-db.sh
```

이 스크립트는 컨테이너를 지우지 않고 `docker exec -i rbac-postgres psql`로 `shop` 데이터베이스를 재생성한 뒤 실습에 사용한 Role 목록을 삭제합니다.

## 실습 종료 후 환경 정리

실습을 모두 마쳤으면 아래 `docker` 명령으로 컨테이너와 네트워크를 삭제합니다.

```bash
docker rm -f rbac-mysql rbac-postgres
docker network rm pg-rbac-net
```

같은 정리 작업을 스크립트로 실행할 수도 있습니다.

```bash
./scripts/cleanup-containers.sh
```
