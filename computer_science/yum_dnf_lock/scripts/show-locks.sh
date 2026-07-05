#!/usr/bin/env bash
set -euo pipefail

lock_files=(
  "/var/cache/dnf/metadata_lock.pid"
  "/var/lib/dnf/rpmdb_lock.pid"
  "/run/dnf.pid"
  "/var/run/dnf.pid"
)

echo "== lock files =="
for lock_file in "${lock_files[@]}"; do
  if [ -e "${lock_file}" ]; then
    echo "--- ${lock_file}"
    ls -l "${lock_file}"
    sed -n '1,5p' "${lock_file}" || true
    fuser -v "${lock_file}" || true
    lsof "${lock_file}" || true
  else
    echo "--- ${lock_file} missing"
  fi
done

echo
echo "== package manager processes =="
ps -eo pid,ppid,stat,comm,args | awk 'NR == 1 || /dnf|yum|rpm|hold-dnf-lock|python3/'
