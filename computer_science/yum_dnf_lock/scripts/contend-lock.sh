#!/usr/bin/env bash
set -euo pipefail

mkdir -p /workspace/runtime

echo "contender shell pid=$$"
set +e
timeout 8s bash /workspace/scripts/dnf-command.sh
status=$?
set -e

if [[ "${status}" -eq 124 ]]; then
  echo "contender timed out while waiting for the dnf lock"
  exit 0
fi

exit "${status}"
