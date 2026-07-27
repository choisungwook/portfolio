#!/bin/bash
# Client node. The forward path is pinned to r1 and never changes during the lab.
set -eu

/scripts/rpfilter.sh 0 > /dev/null
ip route replace 10.20.0.0/24 via 10.10.0.2

echo "client ready: 10.10.0.10, 10.20.0.0/24 via r1(10.10.0.2)"

sleep infinity
