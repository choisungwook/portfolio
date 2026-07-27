#!/bin/sh
# Runs every transfer path over the same file so the CPU cost can be compared.
# Three rounds, because a single wall time on a loopback socket is noisy.
set -e

ROUNDS="${1:-3}"
I=1

while [ "$I" -le "$ROUNDS" ]; do
  echo "round $I"
  for MODE in readwrite mmap sendfile; do
    /lab/scripts/transfer.sh "$MODE" 2>/dev/null
  done
  I=$((I + 1))
done
