#!/usr/bin/env bash
set -eu

LOCK_FILE="${1:-/var/cache/dnf/metadata_lock.pid}"

if [ ! -e "${LOCK_FILE}" ]; then
  echo "lock file does not exist: ${LOCK_FILE}"
  exit 0
fi

echo "lock file: ${LOCK_FILE}"
echo "lock file content:"
cat "${LOCK_FILE}" || true

PID="$(tr -dc '0-9' < "${LOCK_FILE}" | head -c 12 || true)"

if [ -n "${PID}" ] && [ -d "/proc/${PID}" ]; then
  echo
  echo "process from lock file:"
  ps -o pid,ppid,stat,comm,args -p "${PID}" || true
else
  echo
  echo "no running process matched the pid from the lock file"
fi

if command -v lsof >/dev/null 2>&1; then
  echo
  echo "lsof:"
  lsof "${LOCK_FILE}" || true
fi

if command -v fuser >/dev/null 2>&1; then
  echo
  echo "fuser:"
  fuser -v "${LOCK_FILE}" || true
fi
