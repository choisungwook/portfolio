#!/usr/bin/env bash
set -eu

LOCK_TIMEOUT="${LOCK_TIMEOUT:-5}"

echo "running dnf makecache with lock_timeout=${LOCK_TIMEOUT}"
dnf --setopt=lock_timeout="${LOCK_TIMEOUT}" --setopt=metadata_timer_sync=0 makecache
