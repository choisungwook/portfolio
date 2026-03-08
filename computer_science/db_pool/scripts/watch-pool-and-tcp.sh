#!/bin/bash
set -euo pipefail

APP_URL=${1:-http://localhost:8080}
MYSQL_PORT=${2:-3306}
INTERVAL=${3:-2}

echo "Watching HikariCP pool status and TCP connections every ${INTERVAL}s"
echo "App: $APP_URL | MySQL port: $MYSQL_PORT"
echo "Press Ctrl+C to stop"
echo "---"

while true; do
  TIMESTAMP=$(date '+%H:%M:%S')

  POOL=$(curl -s "$APP_URL/pool-status" 2>/dev/null || echo "app unreachable")
  TCP_COUNT=$(ss -tn state established "( dport = :$MYSQL_PORT )" 2>/dev/null | tail -n +2 | wc -l)

  echo "[$TIMESTAMP] pool=($POOL) | tcp_established=$TCP_COUNT"
  sleep "$INTERVAL"
done
