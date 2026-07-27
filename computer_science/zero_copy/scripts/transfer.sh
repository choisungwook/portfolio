#!/bin/sh
# Runs one transfer with the given mode and prints what it cost.
#   usage: transfer.sh <readwrite|mmap|sendfile> [strace]
set -e

MODE="${1:?usage: transfer.sh <readwrite|mmap|sendfile> [strace]}"
TRACE="${2:-}"
PORT=9000
FILE=/data/testfile

[ -f "$FILE" ] || { echo "no $FILE, run make-testfile.sh first" >&2; exit 1; }

if [ "$TRACE" = "strace" ]; then
  strace -c -f -e trace=read,write,sendfile,mmap \
    fileserver "$MODE" "$PORT" "$FILE" &
else
  fileserver "$MODE" "$PORT" "$FILE" &
fi
SERVER_PID=$!

# Wait for the listening socket instead of sleeping a fixed amount. A probe
# connection cannot be used here: the server accepts exactly one client.
PORT_HEX=$(printf '%04X' "$PORT")
while ! grep -q ":$PORT_HEX " /proc/net/tcp; do
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "server died" >&2; exit 1; }
done

nc 127.0.0.1 "$PORT" > /dev/null
wait "$SERVER_PID"
