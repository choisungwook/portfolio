#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL 실습용 shop 데이터베이스와 Role을 초기 상태로 되돌립니다.
docker exec -i rbac-postgres psql -U postgres -d postgres <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'shop' AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS shop;
CREATE DATABASE shop;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'app_read', 'app_rw', 'app_owner',
    'app_user', 'app_blue', 'app_green',
    'migrator_v1', 'migrator_v2',
    'migrator_blue', 'migrator_green'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('DROP ROLE %I', r);
    END IF;
  END LOOP;
END
$$;
SQL

echo "PostgreSQL shop 데이터베이스와 실습 Role을 초기화했습니다."
