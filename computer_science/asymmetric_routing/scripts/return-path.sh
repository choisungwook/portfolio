#!/bin/bash
# Flip the server return path between the two routers.
#   r1 -> symmetric   (replies leave through the router the request came in on)
#   r2 -> asymmetric  (replies leave through the other router)
set -eu

case "${1:?usage: return-path.sh <r1|r2>}" in
  r1) gw=10.20.0.2 ;;
  r2) gw=10.30.0.3 ;;
  *)  echo "usage: return-path.sh <r1|r2>" >&2; exit 1 ;;
esac

ip route replace 10.10.0.0/24 via "$gw"
ip route get 10.10.0.10
