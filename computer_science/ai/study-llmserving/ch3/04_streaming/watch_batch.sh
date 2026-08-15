#!/usr/bin/env bash
# Poll /batch_state to watch sequences join and leave the running batch.
set -euo pipefail
URL="${1:-http://localhost:8000}"
while true; do
  printf '\033[H\033[2J'
  date +%T
  curl -s "${URL}/batch_state" | python3 -m json.tool
  sleep 0.3
done
