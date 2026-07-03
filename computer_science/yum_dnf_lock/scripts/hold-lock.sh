#!/usr/bin/env bash
set -euo pipefail

mkdir -p /workspace/runtime

cleanup() {
  if [[ -n "${server_pid:-}" ]]; then
    kill "${server_pid}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

python3 /workspace/scripts/slow_repo.py > /workspace/runtime/slow-repo.log 2>&1 &
server_pid=$!
echo "${server_pid}" > /workspace/runtime/slow-repo.pid
echo "slow repo pid=${server_pid}"

sleep 1
echo "dnf holder shell pid=$$"
bash /workspace/scripts/dnf-command.sh
