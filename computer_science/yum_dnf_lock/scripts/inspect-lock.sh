#!/usr/bin/env bash
set -euo pipefail

echo "== dnf processes =="
ps -ef | grep '[d]nf' || true

echo
echo "== lock and pid candidates =="
find /var/cache/dnf /var/lib/dnf -maxdepth 3 \
  \( -name '*lock*' -o -name '*pid*' \) \
  -print 2>/dev/null || true

echo
echo "== lsof /var/cache/dnf =="
lsof +D /var/cache/dnf 2>/dev/null | grep -E 'dnf|python' || true

echo
echo "== fuser =="
fuser -v /var/cache/dnf /var/lib/dnf 2>/dev/null || true
