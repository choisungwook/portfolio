#!/bin/bash
# Router node. Forwarding on, reverse path filtering off so the lab starts from
# a permissive baseline. Every scenario turns filtering on explicitly.
set -eu

sysctl -qw net.ipv4.ip_forward=1
/scripts/rpfilter.sh 0 > /dev/null

echo "router $(hostname) ready: ip_forward=1 rp_filter=0"
ip -4 -o addr show scope global

sleep infinity
