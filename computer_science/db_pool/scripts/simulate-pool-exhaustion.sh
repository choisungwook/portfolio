#!/bin/bash
set -euo pipefail

APP_URL=${1:-http://localhost:8080}
CONCURRENT=${2:-10}
SLEEP_SEC=${3:-15}

echo "=== Connection Pool Exhaustion Test ==="
echo "Sending $CONCURRENT concurrent slow queries (sleep ${SLEEP_SEC}s each)"
echo "Pool max-size: 5 → expect timeout after 5 connections"
echo ""

for i in $(seq 1 "$CONCURRENT"); do
  curl -s "$APP_URL/slow?seconds=$SLEEP_SEC" &
  echo "[request $i] sent (pid=$!)"
done

echo ""
echo "All requests sent. Waiting for responses..."
echo "Run 'watch-pool-and-tcp.sh' in another terminal to observe."
wait
echo "Done."
