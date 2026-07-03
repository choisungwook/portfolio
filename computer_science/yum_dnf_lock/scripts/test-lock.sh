#!/usr/bin/env bash
set -euo pipefail

mkdir -p /workspace/runtime
rm -f /workspace/runtime/contender.log

bash /workspace/scripts/hold-lock.sh &
holder_pid=$!

cleanup() {
  kill "${holder_pid}" >/dev/null 2>&1 || true
  wait "${holder_pid}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

sleep 5
bash /workspace/scripts/inspect-lock.sh

set +e
bash /workspace/scripts/contend-lock.sh 2>&1 | tee /workspace/runtime/contender.log
contender_status=${PIPESTATUS[0]}
set -e

if [[ "${contender_status}" -ne 0 ]]; then
  echo "contender exited with status ${contender_status}"
fi

if grep -Eiq 'lock|waiting for process|timed out' /workspace/runtime/contender.log; then
  echo "lock contention observed"
  exit 0
fi

echo "lock contention was not observed"
exit 1
