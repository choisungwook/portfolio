#!/usr/bin/env bash

set -euo pipefail

docker compose --profile "*" down --remove-orphans

remaining_processes="$(nvidia-smi \
  --query-compute-apps=pid,process_name,used_gpu_memory \
  --format=csv,noheader,nounits 2>/dev/null || true)"

if [[ -n "${remaining_processes//[[:space:]]/}" ]]; then
  echo "GPU compute processes remain after project cleanup:" >&2
  echo "$remaining_processes" >&2
  echo "Stop only the listed process you own, then run make gpu-reset again." >&2
  exit 1
fi

echo "No GPU compute process remains. Desktop VRAM can stay allocated."
nvidia-smi \
  --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu \
  --format=csv
