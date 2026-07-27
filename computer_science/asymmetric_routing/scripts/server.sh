#!/bin/bash
# Server node. It is dual homed, so the return path is whatever this route says.
# The lab starts symmetric: replies go back through r1, the same router the
# request came in on.
set -eu

/scripts/rpfilter.sh 0 > /dev/null
ip route replace 10.10.0.0/24 via 10.20.0.2

echo "server ready: 10.20.0.10 / 10.30.0.20, return path via r1(10.20.0.2)"

exec socat TCP-LISTEN:8080,reuseaddr,fork \
  SYSTEM:'printf "HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nok\n"'
