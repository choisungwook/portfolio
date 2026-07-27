#!/bin/bash
# Turn a router into a stateful firewall, or take the rules back out.
#
# nf_conntrack_tcp_loose=1 (the kernel default) lets conntrack adopt a flow it
# never saw the SYN of, which hides asymmetric routing. Real firewalls turn that
# off, so the lab turns it off too.
set -eu

case "${1:?usage: stateful-firewall.sh <on|off>}" in
  on)
    sysctl -qw net.netfilter.nf_conntrack_tcp_loose=0
    iptables -C FORWARD -m conntrack --ctstate INVALID -j DROP 2>/dev/null \
      || iptables -I FORWARD 1 -m conntrack --ctstate INVALID -j DROP
    echo "stateful firewall ON at $(hostname): tcp_loose=0, INVALID dropped"
    ;;
  off)
    sysctl -qw net.netfilter.nf_conntrack_tcp_loose=1
    iptables -D FORWARD -m conntrack --ctstate INVALID -j DROP 2>/dev/null || true
    conntrack -F 2>/dev/null || true
    echo "stateful firewall OFF at $(hostname)"
    ;;
  *)
    echo "usage: stateful-firewall.sh <on|off>" >&2
    exit 1
    ;;
esac

iptables -L FORWARD -n -v --line-numbers
