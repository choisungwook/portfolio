#!/bin/bash
set -euo pipefail

MYSQL_PORT=${1:-3306}

echo "=== TCP connections to MySQL (port $MYSQL_PORT) ==="
echo ""

echo "[1] ss - ESTABLISHED connections"
ss -tnp state established "( dport = :$MYSQL_PORT or sport = :$MYSQL_PORT )" 2>/dev/null || \
  echo "  (no connections found)"

echo ""
echo "[2] ss - all states summary"
ss -tn "( dport = :$MYSQL_PORT or sport = :$MYSQL_PORT )" 2>/dev/null || \
  echo "  (no connections found)"

echo ""
echo "[3] connection count by state"
ss -tn "( dport = :$MYSQL_PORT or sport = :$MYSQL_PORT )" 2>/dev/null | \
  awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn || \
  echo "  (no connections found)"
