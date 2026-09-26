#!/usr/bin/env bash
# 커널 없이 veritysetup으로 해시 트리 생성, 검증, 변조 탐지를 확인한다
set -euo pipefail

LAB=/lab/verity
rm -rf "$LAB" && mkdir -p "$LAB/files"
cd "$LAB"

step() { printf '\n==== %s ====\n' "$1"; }

step "1. 읽기 전용으로 둘 파일시스템 이미지 생성"
echo "trusted binary v1" > files/hello.txt
mkfs.ext4 -q -b 4096 -d files data.img 8M
ls -l data.img

step "2. 해시 트리 생성. 출력의 Root hash가 신뢰의 기준이다"
veritysetup format data.img hash.img | tee format.txt
ROOT_HASH=$(awk '/Root hash/{print $3}' format.txt)
echo "$ROOT_HASH" > root_hash.txt
ls -l hash.img

step "3. 원본 그대로 검증"
veritysetup verify data.img hash.img "$ROOT_HASH" && echo "결과: 검증 통과"

step "4. 데이터 블록 1바이트 변조"
OFFSET=$(grep -obUa "trusted binary v1" data.img | head -1 | cut -d: -f1)
echo "hello.txt 내용 위치: byte $OFFSET, 4KiB 블록 번호 $((OFFSET / 4096))"
printf 'T' | dd of=data.img bs=1 seek="$OFFSET" conv=notrunc status=none
xxd -s "$OFFSET" -l 17 data.img
veritysetup verify data.img hash.img "$ROOT_HASH" || echo "결과: 변조 탐지 (exit $?)"

step "5. 공격자가 해시 트리까지 다시 만들면"
veritysetup format data.img hash_forged.img > forged.txt
FORGED_ROOT=$(awk '/Root hash/{print $3}' forged.txt)
echo "신뢰하는 root hash: $ROOT_HASH"
echo "위조한 root hash  : $FORGED_ROOT"
veritysetup verify data.img hash_forged.img "$ROOT_HASH" || echo "결과: 신뢰하는 root hash와 맞지 않아 탐지 (exit $?)"
echo "위조한 root hash를 믿으면 통과한다. 그래서 root hash는 서명된 부트 체인이 넘겨야 한다"
veritysetup verify data.img hash_forged.img "$FORGED_ROOT" && echo "결과: 위조 root hash로는 통과"
