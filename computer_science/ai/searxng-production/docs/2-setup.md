# SearXNG 프로덕션 실습 환경

Docker Compose로 Basic Auth gateway, SearXNG replica 2개, 공유 Valkey, `429`를 반환하는 mock 검색 엔진을 실행한다.

이 구성은 동작을 재현하는 로컬 환경이다. gateway와 Valkey가 각각 하나이므로 프로덕션 HA로 사용하지 않는다.

## Up

workspace에서 전체 환경을 실행한다.

```bash
docker compose up -d --wait
```

## Down

container와 실습용 volume을 정리한다.

```bash
docker compose down -v
```
