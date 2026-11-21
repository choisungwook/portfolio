#!/usr/bin/env bash
set -euo pipefail

docker rm -f rbac-mysql rbac-postgres >/dev/null 2>&1 || true
docker network rm pg-rbac-net >/dev/null 2>&1 || true
echo "rbac-mysql, rbac-postgres 컨테이너와 pg-rbac-net 네트워크를 정리했습니다."
