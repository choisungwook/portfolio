#!/bin/sh
# Creates the file every transfer path sends. Size in MB, 512 by default.
set -e

SIZE_MB="${1:-512}"
FILE=/data/testfile

dd if=/dev/zero of="$FILE" bs=1M count="$SIZE_MB" status=none
ls -lh "$FILE"

# Read it once so the page cache is warm. Cold cache would measure the disk,
# not the copies.
cat "$FILE" > /dev/null
echo "page cache warmed"
