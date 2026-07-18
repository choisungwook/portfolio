#!/usr/bin/env bash
# O_DIRECT 읽기가 page cache를 우회하는 것을 관찰한다.
# root 권한이 필요하다 (drop_caches).
set -euo pipefail

TEST_FILE="${TEST_FILE:-/tmp/pagecache-test}"

if [ ! -f "$TEST_FILE" ]; then
  echo "[setup] 1GB 실습 파일 생성: $TEST_FILE"
  dd if=/dev/zero of="$TEST_FILE" bs=1M count=1024 status=none
fi

echo "[1] page cache 비우기"
sync && echo 3 > /proc/sys/vm/drop_caches

echo "[2] 읽기 전 Cached"
grep "^Cached" /proc/meminfo

echo "[3] O_DIRECT read 1회차"
time dd if="$TEST_FILE" of=/dev/null bs=1M iflag=direct status=none

echo "[4] 읽은 후 Cached (늘지 않는다)"
grep "^Cached" /proc/meminfo

echo "[5] O_DIRECT read 2회차 (캐시 히트가 없어 여전히 느리다)"
time dd if="$TEST_FILE" of=/dev/null bs=1M iflag=direct status=none

echo "[6] 비교: buffered read (1회 읽고 나면 warm)"
cat "$TEST_FILE" > /dev/null
time cat "$TEST_FILE" > /dev/null
