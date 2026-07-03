#!/usr/bin/env bash
set -euo pipefail

lock_file="${1:-/var/cache/dnf/metadata_lock.pid}"
sleep_seconds="${2:-60}"

mkdir -p "$(dirname "${lock_file}")"

python3 - "${lock_file}" "${sleep_seconds}" <<'PY'
import fcntl
import os
import sys
import time

lock_file = sys.argv[1]
sleep_seconds = int(sys.argv[2])

with open(lock_file, "w+", encoding="utf-8") as handle:
  fcntl.lockf(handle, fcntl.LOCK_EX)
  handle.seek(0)
  handle.write(f"{os.getpid()}\n")
  handle.truncate()
  handle.flush()
  print(f"LOCK_HELD path={lock_file} pid={os.getpid()} seconds={sleep_seconds}", flush=True)
  time.sleep(sleep_seconds)
PY
