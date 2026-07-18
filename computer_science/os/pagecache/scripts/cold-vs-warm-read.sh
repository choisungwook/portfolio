#!/usr/bin/env bash
# cold read vs warm read 시간을 비교하고 Cached 증가를 관찰한다.
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

echo "[3] cold read (디스크에서 읽기)"
time cat "$TEST_FILE" > /dev/null

echo "[4] 읽은 후 Cached (파일 크기만큼 증가)"
grep "^Cached" /proc/meminfo

echo "[5] warm read (page cache에서 읽기, 새 프로세스지만 빠르다)"
time cat "$TEST_FILE" > /dev/null
