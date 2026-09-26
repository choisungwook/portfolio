# dm-verity 커널 실습: 변조된 블록만 EIO가 난다

ext4 이미지를 dm-verity 디바이스로 열어 읽기 전용 마운트를 만들고, 파일 하나의 바이트를 바꿔 커널이 그 블록을 읽을 때만 거부하는 것을 확인한다. 환경은 [5-setup-ec2.md](5-setup-ec2.md)다. 원리는 [2-dm-verity-concepts.md](2-dm-verity-concepts.md)에 있다.

> 확인 필요: 결과는 커널 dm-verity 문서와 veritysetup 동작 기준 예상이다. 블록 번호, 오프셋, loop 번호는 실행마다 다르다.

모든 명령은 EC2에서 `sudo -i`한 root 셸로 실행한다.

## 1. ext4 이미지 만들기

64MiB ext4 이미지에 파일 2개를 넣는다. `secret.txt`는 나중에 변조하고 `other.txt`는 그대로 둔다.

```bash
mkdir -p /root/verity /mnt/rw /mnt/verity && cd /root/verity
truncate -s 64M data.img
mkfs.ext4 -q data.img
mount -o loop data.img /mnt/rw
yes AKBUN-MARKER | head -c 8192 > /mnt/rw/secret.txt
yes other-file | head -c 8192 > /mnt/rw/other.txt
umount /mnt/rw
```

- 해시 트리를 만든 뒤에는 이 이미지를 쓰기로 마운트하지 않는다. 마운트만 해도 superblock의 마운트 시각이 바뀌어 검증에 실패한다

## 2. 해시 트리 만들기

```bash
veritysetup format data.img hash.img | tee format.txt
ROOT=$(awk '/^Root hash/{print $3}' format.txt)
```

| 항목 | 예상 값 |
|---|---|
| Data blocks | 16384 |
| Hash blocks | 129. level 0의 128개 + level 1의 1개 |

## 3. dm-verity 디바이스로 열기

`open`부터 커널 device-mapper가 동작한다. 로컬 docker 실습에서 하지 못한 단계다.

```bash
veritysetup open data.img verity-lab hash.img $ROOT
veritysetup status verity-lab
dmsetup table verity-lab
```

예상 출력이다.

```text
/dev/mapper/verity-lab is active.
  type:        VERITY
  status:      verified
  hash type:   1
  data block:  4096
  hash block:  4096
  hash name:   sha256
  ...
0 131072 verity 1 7:0 7:1 4096 4096 16384 1 sha256 <root hash> <salt>
```

- `dmsetup table`의 한 줄이 커널에 넘긴 설정 전부다. 순서대로 시작 섹터, 길이(512바이트 섹터), target 이름, format 버전, data device, hash device, 블록 크기 2개, 데이터 블록 수, 해시 시작 블록, 알고리즘, root hash, salt
- Bottlerocket은 이 한 줄을 커널 cmdline(`dm-mod.create=`)에 넣어 부팅 때 만든다

## 4. 마운트하고 읽기

```bash
mount -o ro /dev/mapper/verity-lab /mnt/verity
head -c 26 /mnt/verity/secret.txt; echo
blockdev --getro /dev/mapper/verity-lab
mount -o remount,rw /mnt/verity
```

| 명령 | 예상 결과 |
|---|---|
| `head` | `AKBUN-MARKER` 2줄 |
| `blockdev --getro` | `1`. 디바이스 자체가 읽기 전용 |
| `remount,rw` | `cannot remount /dev/mapper/verity-lab read-write, is write-protected` |

- 쓰기 거부는 파일시스템 옵션이 아니라 블록 디바이스 수준이다. root가 remount해도 쓰기로 바뀌지 않는다

## 5. 원본 이미지에서 바이트 하나 바꾸기

dm-verity 디바이스를 닫고, 원본 `data.img`에서 `secret.txt` 내용이 있는 위치를 찾아 한 바이트를 바꾼다.

```bash
umount /mnt/verity
veritysetup close verity-lab
OFFSET=$(grep -abo AKBUN-MARKER data.img | head -1 | cut -d: -f1)
echo "offset=$OFFSET block=$((OFFSET / 4096))"
printf 'X' | dd of=data.img bs=1 seek=$OFFSET conv=notrunc status=none
```

- 닫았다 여는 이유는 page cache다. 이미 검증해 캐시한 블록은 다시 검증하지 않는다

## 6. 다시 열고 읽기

```bash
veritysetup open data.img verity-lab hash.img $ROOT
mount -o ro /dev/mapper/verity-lab /mnt/verity
head -c 26 /mnt/verity/other.txt; echo
head -c 26 /mnt/verity/secret.txt; echo
dmesg | grep verity | tail -3
```

| 명령 | 예상 결과 |
|---|---|
| `open` | 성공. 열 때 전체를 검사하지 않는다 |
| `mount` | 성공. ext4 superblock 블록은 변조되지 않았다 |
| `other.txt` | `other-file` 2줄. 변조되지 않은 블록은 정상 |
| `secret.txt` | `head: error reading '/mnt/verity/secret.txt': Input/output error` |
| `dmesg` | `device-mapper: verity: 7:0: data block <번호> is corrupted` |

- dmesg의 블록 번호가 5단계에서 계산한 `block=` 값과 같다
- 디스크 일부가 변조돼도 그 블록을 읽기 전까지 아무 일도 없다. 기본 동작(EIO)은 변조된 파일만 실패하고 시스템은 계속 돈다

## 7. 재시작 옵션 (선택, 인스턴스가 재부팅됨)

Bottlerocket처럼 변조를 발견하면 재시작하게 연다. 실행하면 SSM 세션이 끊기고 인스턴스가 재부팅된다.

```bash
umount /mnt/verity && veritysetup close verity-lab
veritysetup open --restart-on-corruption data.img verity-lab hash.img $ROOT
dmsetup table verity-lab
mount -o ro /dev/mapper/verity-lab /mnt/verity
cat /mnt/verity/secret.txt
```

| 명령 | 예상 결과 |
|---|---|
| `dmsetup table` | 줄 끝에 `1 restart_on_corruption` |
| `cat` | 커널이 재시작. SSM 세션 종료 |

- 재부팅 뒤에는 `/dev/mapper/verity-lab`이 없다. 디바이스를 부팅 때 만드는 설정이 없어서다

## 8. 정리

7단계를 건너뛰었으면 실행한다.

```bash
umount /mnt/verity
veritysetup close verity-lab
rm -rf /root/verity
```

## 정리

| 실습 | 확인한 것 |
|---|---|
| 3 | `veritysetup open`은 dm-verity target 한 줄을 커널에 넘기는 일 |
| 4 | 쓰기 거부가 블록 디바이스 수준 |
| 6 | 검증은 읽는 블록만. 다른 파일은 정상, 변조된 블록만 EIO |
| 7 | 실패 동작은 target 옵션으로 정함. Bottlerocket은 재시작 |
