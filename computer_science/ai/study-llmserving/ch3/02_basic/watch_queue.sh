#!/usr/bin/env bash
set -euo pipefail

URL="${1:-http://localhost:8000}"

while true; do
  printf '\033[H\033[2J'
  date +%T
  curl -s "${URL}/queue_state" | python3 -m json.tool
  sleep 0.2
done
