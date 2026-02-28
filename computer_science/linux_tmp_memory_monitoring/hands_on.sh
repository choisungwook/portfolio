#!/bin/bash
#
# /tmp(tmpfs)와 메모리 사용률 관계 실습 스크립트
# 주의: 이 스크립트는 /tmp에 512MB 파일을 생성합니다.
#

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

TMP_FILE="/tmp/memory_test_file"
FILE_SIZE_MB=512

print_header() {
    echo ""
    echo -e "${BOLD}========================================${NC}"
    echo -e "${BOLD} $1${NC}"
    echo -e "${BOLD}========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}[STEP $1]${NC} $2"
    echo ""
}

print_warn() {
    echo -e "${YELLOW}[주의]${NC} $1"
}

cleanup() {
    if [ -f "$TMP_FILE" ]; then
        rm -f "$TMP_FILE"
        echo -e "${YELLOW}테스트 파일을 정리했습니다.${NC}"
    fi
}

trap cleanup EXIT

# ==================================================
# Step 1: /tmp가 tmpfs인지 확인
# ==================================================
print_header "/tmp(tmpfs)와 메모리 사용률 관계 실습"

print_step 1 "/tmp 파일시스템 타입 확인"

TMP_FS_TYPE=$(df -Th /tmp | tail -1 | awk '{print $2}')
echo "명령어: df -Th /tmp"
echo "---"
df -Th /tmp
echo "---"
echo ""

if [ "$TMP_FS_TYPE" = "tmpfs" ]; then
    echo -e "${GREEN}/tmp는 tmpfs입니다. → RAM 기반${NC}"
    echo "이 시스템에서 /tmp에 파일을 쓰면 메모리 사용률이 올라갑니다."
else
    echo -e "${YELLOW}/tmp는 ${TMP_FS_TYPE}입니다. → 디스크 기반${NC}"
    echo "/tmp가 tmpfs가 아니므로 메모리에 영향을 주지 않습니다."
    echo ""
    echo "/dev/shm으로 대신 테스트합니다. /dev/shm은 항상 tmpfs입니다."
    TMP_FILE="/dev/shm/memory_test_file"
    echo ""
    echo "명령어: df -Th /dev/shm"
    df -Th /dev/shm
fi

echo ""

# ==================================================
# Step 2: 현재 메모리 상태 확인 (BEFORE)
# ==================================================
print_step 2 "현재 메모리 상태 확인 (BEFORE)"

echo "명령어: free -h"
echo "---"
free -h
echo "---"
echo ""

echo "명령어: grep -E 'MemTotal|MemAvailable|MemFree|Shmem:' /proc/meminfo"
echo "---"
grep -E "MemTotal|MemAvailable|MemFree|Shmem:" /proc/meminfo
echo "---"

SHMEM_BEFORE=$(grep "^Shmem:" /proc/meminfo | awk '{print $2}')
MEM_AVAILABLE_BEFORE=$(grep "MemAvailable:" /proc/meminfo | awk '{print $2}')

echo ""
echo "현재 Shmem(shared memory): ${SHMEM_BEFORE} kB"
echo "현재 MemAvailable: ${MEM_AVAILABLE_BEFORE} kB"
echo ""

# ==================================================
# Step 3: /tmp에 대용량 파일 생성
# ==================================================
print_step 3 "/tmp에 ${FILE_SIZE_MB}MB 파일 생성"

print_warn "${FILE_SIZE_MB}MB 파일을 생성합니다. (스크립트 종료 시 자동 삭제)"
echo ""

echo "명령어: dd if=/dev/zero of=${TMP_FILE} bs=1M count=${FILE_SIZE_MB}"
dd if=/dev/zero of="$TMP_FILE" bs=1M count=$FILE_SIZE_MB 2>&1
echo ""

echo "생성된 파일 확인:"
ls -lh "$TMP_FILE"
echo ""

# ==================================================
# Step 4: 메모리 상태 변화 확인 (AFTER)
# ==================================================
print_step 4 "메모리 상태 변화 확인 (AFTER)"

echo "명령어: free -h"
echo "---"
free -h
echo "---"
echo ""

echo "명령어: grep -E 'MemTotal|MemAvailable|MemFree|Shmem:' /proc/meminfo"
echo "---"
grep -E "MemTotal|MemAvailable|MemFree|Shmem:" /proc/meminfo
echo "---"

SHMEM_AFTER=$(grep "^Shmem:" /proc/meminfo | awk '{print $2}')
MEM_AVAILABLE_AFTER=$(grep "MemAvailable:" /proc/meminfo | awk '{print $2}')

echo ""
SHMEM_DIFF=$((SHMEM_AFTER - SHMEM_BEFORE))
MEM_DIFF=$((MEM_AVAILABLE_BEFORE - MEM_AVAILABLE_AFTER))

echo -e "${BOLD}=== 비교 결과 ===${NC}"
echo ""
echo "Shmem 변화: ${SHMEM_BEFORE} kB → ${SHMEM_AFTER} kB (${SHMEM_DIFF} kB 증가)"
echo "MemAvailable 변화: ${MEM_AVAILABLE_BEFORE} kB → ${MEM_AVAILABLE_AFTER} kB (${MEM_DIFF} kB 감소)"
echo ""
echo -e "${RED}→ /tmp에 ${FILE_SIZE_MB}MB 파일을 쓴 것만으로 shared memory가 약 ${SHMEM_DIFF} kB 증가했습니다.${NC}"
echo -e "${RED}→ 사용 가능한 메모리(MemAvailable)가 약 ${MEM_DIFF} kB 감소했습니다.${NC}"
echo ""

# ==================================================
# Step 5: 파일 삭제 후 메모리 복구 확인
# ==================================================
print_step 5 "파일 삭제 후 메모리 복구 확인"

echo "명령어: rm -f ${TMP_FILE}"
rm -f "$TMP_FILE"
echo "파일 삭제 완료"
echo ""

# trap이 다시 삭제하지 않도록 플래그 설정 불필요 (파일이 이미 없으므로)

echo "명령어: grep -E 'MemTotal|MemAvailable|MemFree|Shmem:' /proc/meminfo"
echo "---"
grep -E "MemTotal|MemAvailable|MemFree|Shmem:" /proc/meminfo
echo "---"

SHMEM_FINAL=$(grep "^Shmem:" /proc/meminfo | awk '{print $2}')
MEM_AVAILABLE_FINAL=$(grep "MemAvailable:" /proc/meminfo | awk '{print $2}')

echo ""
echo -e "${BOLD}=== 최종 비교 ===${NC}"
echo ""
echo "           BEFORE → AFTER(파일 생성) → FINAL(파일 삭제)"
echo "Shmem:     ${SHMEM_BEFORE} kB → ${SHMEM_AFTER} kB → ${SHMEM_FINAL} kB"
echo "Available: ${MEM_AVAILABLE_BEFORE} kB → ${MEM_AVAILABLE_AFTER} kB → ${MEM_AVAILABLE_FINAL} kB"
echo ""
echo -e "${GREEN}→ 파일을 삭제하면 메모리가 즉시 복구됩니다.${NC}"
echo ""

# ==================================================
# 결론
# ==================================================
print_header "실습 정리"

echo "1. /tmp가 tmpfs로 마운트되어 있으면 파일 쓰기 = 메모리 사용"
echo "2. Shmem(shared memory) 값이 증가하고, MemAvailable이 감소"
echo "3. 파일을 삭제하면 메모리가 즉시 복구됨"
echo "4. 메모리 모니터링 시 프로세스 RSS뿐 아니라 tmpfs 사용량도 확인 필요"
echo ""
echo "확인 명령어 요약:"
echo "  df -Th /tmp              # /tmp 파일시스템 타입 확인"
echo "  free -h                  # shared 컬럼 확인"
echo "  grep Shmem /proc/meminfo # shared memory 크기 확인"
echo "  du -sh /tmp              # /tmp 사용량 확인"
echo ""
