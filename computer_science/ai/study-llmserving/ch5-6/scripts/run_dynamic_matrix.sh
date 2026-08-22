#!/usr/bin/env bash

set -euo pipefail

configs=("1 0" "4 20" "8 50")
active_service=""

cleanup() {
  if [[ -n "$active_service" ]]; then
    docker compose stop "$active_service"
    docker compose rm -f "$active_service"
  fi
}

trap cleanup EXIT

for config in "${configs[@]}"; do
  read -r batch delay_ms <<<"$config"
  MAX_BATCH_SIZE="$batch" MAX_DELAY_MS="$delay_ms" \
    docker compose --profile dynamic up -d --force-recreate dynamic-batcher
  active_service="dynamic-batcher"
  bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
  docker compose --profile tools run --rm \
    -e MODEL_BASE_URL=http://dynamic-batcher:8000 \
    benchmark python -m benchmark.benchmark_dynamic
  docker compose stop dynamic-batcher
  docker compose rm -f dynamic-batcher
  active_service=""
done
