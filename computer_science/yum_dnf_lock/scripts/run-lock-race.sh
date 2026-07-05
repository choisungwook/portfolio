#!/usr/bin/env bash
set -euo pipefail

lock_file="${DNF_LOCK_FILE:-/var/cache/dnf/metadata_lock.pid}"
sleep_seconds="${SLEEP_SECONDS:-20}"
holder_log="/tmp/dnf-lock-holder.log"
dnf_log="/tmp/dnf-race.log"

rm -f "${holder_log}" "${dnf_log}"

/lab/scripts/hold-dnf-lock.sh "${lock_file}" "${sleep_seconds}" >"${holder_log}" 2>&1 &
holder_pid="$!"

sleep 1

echo "== lock holder =="
cat "${holder_log}"

echo
echo "== dnf command =="
echo "command: timeout 8s dnf -y makecache --refresh"

set +e
timeout 8s dnf -y makecache --refresh >"${dnf_log}" 2>&1
dnf_status="$?"
set -e

cat "${dnf_log}"
echo "dnf_status=${dnf_status}"

if [ "${dnf_status}" = "124" ]; then
  echo "result=dnf_waited_for_lock"
else
  echo "result=check_output_and_lock_path"
fi

echo
echo "== observed locks =="
/lab/scripts/show-locks.sh

kill "${holder_pid}" >/dev/null 2>&1 || true
wait "${holder_pid}" >/dev/null 2>&1 || true
