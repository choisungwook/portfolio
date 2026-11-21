# 트러블슈팅

실습 중 자주 만나거나 환경 차이로 생길 수 있는 증상과 해결 방법을 정리합니다.

## 1. PostgreSQL 16 `\du` 출력에 `Member of` 열이 보이지 않음

- **증상**: `\du app_user`를 실행했을 때 `Role name`과 `Attributes`만 출력되고 소속 그룹 Role(`app_read`)이 표시되지 않습니다.
- **원인**: PostgreSQL 16부터 역할 멤버십 옵션(`ADMIN`, `INHERIT`, `SET`)이 세분화되면서 `\du`에서 `Member of` 열이 제거되고 별도 메타 명령 `\drg`로 분리되었습니다.
- **해결**: 역할 간 멤버십을 확인하려면 `psql`에서 `\drg` 명령을 실행합니다.

## 2. `DROP OWNED BY <role>`을 먼저 실행해 테이블이 삭제됨

- **증상**: 계정을 삭제하려고 `DROP OWNED BY migrator_v1;`을 실행했더니 `products` 테이블까지 함께 사라졌습니다.
- **원인**: PostgreSQL의 `DROP OWNED`는 권한 회수뿐만 아니라 해당 Role이 소유한 모든 객체를 실제로 `DROP`합니다.
- **해결**: 로컬 실습 중이라면 `./scripts/reset-postgres-db.sh`로 초기화합니다. 실무에서는 어떤 경우에도 `REASSIGN OWNED BY <구 계정> TO <새 소유 Role>;`을 먼저 실행해 소유권을 넘긴 뒤 `DROP OWNED`를 호출해야 합니다.

## 3. Flyway 컨테이너 실행 시 `Connection refused` 또는 호스트 이름 해석 실패

- **증상**: `docker run ... flyway/flyway:10` 실행 시 `rbac-postgres:5432`에 연결하지 못합니다.
- **원인**: `--network pg-rbac-net` 옵션을 빠뜨렸거나 `rbac-postgres` 컨테이너가 아직 기동 중입니다.
- **해결**: `docker ps --filter name=rbac-`로 컨테이너 상태와 네트워크를 확인하고, 반드시 `--network pg-rbac-net`을 포함해 Flyway를 실행합니다.

## 4. `SERIAL` 컬럼 테이블에 `INSERT` 시 `permission denied for sequence` 발생

- **증상**: `app_user`에게 테이블 `SELECT, INSERT, UPDATE, DELETE` 권한을 모두 줬는데 `INSERT INTO orders ...`가 시퀀스 권한 오류로 실패합니다.
- **원인**: `SERIAL` 컬럼은 내부적으로 `<테이블명>_<컬럼명>_seq` 시퀀스 객체의 `nextval()`을 호출하므로 시퀀스 `USAGE` 권한이 별도로 필요합니다.
- **해결**: 기존 시퀀스에는 `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;`를, 미래 시퀀스에는 `ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;`를 함께 설정합니다.
