#!/bin/bash
# Set rp_filter (reverse path filtering) on every interface of this container.
#   0 = off, 1 = strict (RFC 3704), 2 = loose
# The kernel uses max(conf.all.rp_filter, conf.<dev>.rp_filter), so both are set.
set -eu

mode="${1:?usage: rpfilter.sh <0|1|2>}"

for f in /proc/sys/net/ipv4/conf/*/rp_filter; do
  echo "$mode" > "$f"
done

echo "rp_filter=$mode on $(hostname)"
