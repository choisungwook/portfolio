#!/bin/bash
set -euo pipefail

MYSQL_PORT=${1:-3306}
OUTPUT_FILE=${2:-/tmp/mysql-tcp-capture.pcap}

echo "=== Capturing MySQL TCP traffic on port $MYSQL_PORT ==="
echo "Output: $OUTPUT_FILE"
echo "Press Ctrl+C to stop"
echo ""

tcpdump -i any -nn "port $MYSQL_PORT" -w "$OUTPUT_FILE" -v
