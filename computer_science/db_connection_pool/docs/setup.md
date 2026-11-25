# 실습 환경 준비

로컬 docker compose 하나로 PostgreSQL, 앱, 부하 생성기를 띄웁니다. 코드와 설정은 [구현 명세](./implementation-spec.md)를 따릅니다. 아래 명령은 구현 전 설계이며, 구현 후 실제 동작을 확인해 고칩니다.

## 기동과 정리

모든 명령은 저장소 루트에서 시작합니다. 첫 기동은 `grow` 프로필로 합니다.

```bash
cd computer_science/db_connection_pool
docker compose --env-file profiles/grow.env up -d
```

실습을 마치면 PostgreSQL 볼륨까지 지웁니다.

```bash
docker compose down -v
```

## 프로필 교체

시나리오마다 풀 설정이 다르므로 `app`만 다시 만듭니다. PostgreSQL은 그대로 두므로 이전 시나리오의 세션은 앱 컨테이너가 내려갈 때 함께 닫힙니다.

```bash
docker compose --env-file profiles/<fixed|grow|timeout|shrink>.env up -d --force-recreate app
```

## 관측 창 준비

터미널 두 개를 씁니다. 왼쪽은 `scripts/watch-pool.sh`를 띄워 두고, 오른쪽에서 `scripts/load.sh`로 부하를 넣습니다. 앱 로그를 함께 보려면 세 번째 터미널에서 `docker compose logs -f app | grep -E 'stats|Added|Closing'`을 띄웁니다.

| 포트 | 용도 |
| --- | --- |
| 5432 | PostgreSQL |
| 6432 | PgBouncer(부록 A) |
| 8080 | app, `/actuator/prometheus` |
