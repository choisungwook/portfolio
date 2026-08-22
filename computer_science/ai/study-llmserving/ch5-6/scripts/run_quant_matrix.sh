#!/usr/bin/env bash

set -euo pipefail

active_service=""

cleanup() {
  if [[ -n "$active_service" ]]; then
    docker compose stop "$active_service"
    docker compose rm -f "$active_service"
  fi
}

trap cleanup EXIT

run_model() {
  service="$1"
  profile="$2"
  label="$3"
  precision="$4"

  docker compose --profile "$profile" up -d "$service"
  active_service="$service"
  bash scripts/wait_for_health.sh http://127.0.0.1:8000/health
  docker compose --profile tools run --rm \
    -e "MODEL_LABEL=$label" \
    -e "PRECISION=$precision" \
    benchmark python -m benchmark.benchmark_long_prefill
  docker compose --profile tools run --rm \
    -e "MODEL_LABEL=$label" \
    -e "PRECISION=$precision" \
    benchmark python -m benchmark.benchmark_long_decode
  if [[ "$label" == "bf16" ]]; then
    docker compose --profile tools run --rm \
      -e MODEL_LABEL=bf16 \
      benchmark python -m benchmark.benchmark_prefix_cache
  fi
  docker compose stop "$service"
  docker compose rm -f "$service"
  active_service=""
}

run_model vllm-bf16 bf16 bf16 BF16
run_model vllm-gptq gptq gptq-int4 W4A16
run_model vllm-fp8 fp8 fp8 W8A8
docker compose --profile tools run --rm benchmark python -m benchmark.summary
