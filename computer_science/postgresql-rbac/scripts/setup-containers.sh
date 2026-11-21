#!/usr/bin/env bash
set -euo pipefail

NETWORK_NAME="pg-rbac-net"

echo "[1/3] Docker 네트워크 생성: ${NETWORK_NAME}"
docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1 || docker network create "${NETWORK_NAME}"

echo "[2/3] MySQL 8.4 컨테이너 기동: rbac-mysql (localhost:13306)"
docker rm -f rbac-mysql >/dev/null 2>&1 || true
docker run -d \
  --name rbac-mysql \
  --network "${NETWORK_NAME}" \
  -p 13306:3306 \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=shop \
  mysql:8.4

echo "[3/3] PostgreSQL 16 컨테이너 기동: rbac-postgres (localhost:15432)"
docker rm -f rbac-postgres >/dev/null 2>&1 || true
docker run -d \
  --name rbac-postgres \
  --network "${NETWORK_NAME}" \
  -p 15432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=pgpass \
  -e POSTGRES_DB=shop \
  postgres:16

echo "컨테이너 준비 대기 중..."
until docker exec rbac-postgres pg_isready -U postgres -d shop >/dev/null 2>&1; do
  sleep 1
done
echo "  - rbac-postgres 준비 완료"

until docker exec rbac-mysql mysqladmin ping -h 127.0.0.1 -uroot -prootpass --silent >/dev/null 2>&1; do
  sleep 2
done
echo "  - rbac-mysql 준비 완료"

docker ps --filter "name=rbac-" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
