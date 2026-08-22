#!/usr/bin/env bash

set -euo pipefail

url="${1:?health URL required}"
timeout_seconds="${2:-900}"
started="$(date +%s)"

until curl --fail --silent --show-error "$url" >/dev/null; do
  now="$(date +%s)"
  if ((now - started >= timeout_seconds)); then
    echo "Timed out waiting for $url" >&2
    exit 1
  fi
  sleep 5
done
