# dm-verity 핸즈온

같은 실습을 두 단계로 한다. A는 Mac의 Docker에서 해시 트리와 변조 탐지를, B는 EC2에서 커널이 읽기 중에 변조를 잡는 동작을 본다.

- 개념: [2-dm-verity-concepts.md](2-dm-verity-concepts.md)

## A. 사용자 공간 검증 (Docker)

환경은 [3-setup-local.md](3-setup-local.md)다. 스크립트 하나가 5단계를 순서대로 실행한다.

```bash
docker compose exec verity /scripts/verity-userspace.sh
```

스크립트는 [scripts/verity-userspace.sh](../scripts/verity-userspace.sh)다. 단계별 출력을 본다.

### 1~2. 이미지와 해시 트리

8MiB ext4 이미지에 `hello.txt` 하나를 넣고 해시 트리를 만든다.

```text
Data blocks:     	2048
Data block size: 	4096
Hash blocks:     	17
Hash block size: 	4096
Hash algorithm:  	sha256
Salt:            	c021de34b3342b9a9233e809ce8fa0387398c2ecfb831482503fb5eb15c513f3
Root hash:      	c205814a2b9903af045170306c1c20e6edb0c8b6c3f5111363f94bd08b923c34
Hash device size: 	73728 [bytes]
```

- 데이터 블록 2048개(8MiB ÷ 4KiB)
- 해시 블록 17개 = leaf 16개(2048 ÷ 128) + 그 위 1개. 해시 트리 크기는 72KiB로 데이터의 0.9%다
- salt는 실행마다 무작위라 root hash도 매번 다르다. 같은 이미지를 재현 가능하게 만들려면 `--salt`를 고정한다

### 3~4. 1바이트 변조

`hello.txt`의 첫 글자 `t`를 `T`로 바꾼다.

```text
hello.txt 내용 위치: byte 4759552, 4KiB 블록 번호 1162
0048a000: 5472 7573 7465 6420 6269 6e61 7279 2076  Trusted binary v
Verification failed at position 4759552.
Verification of data area failed.
결과: 변조 탐지 (exit 2)
```

- 실패 위치 4759552 ÷ 4096 = 블록 1162. 바꾼 블록을 정확히 가리킨다
- 파일시스템을 모르는 상태에서 블록만으로 찾았다

### 5. 해시 트리까지 다시 만들면

공격자가 변조한 이미지로 해시 트리를 새로 만든다.

```text
신뢰하는 root hash: c205814a2b9903af045170306c1c20e6edb0c8b6c3f5111363f94bd08b923c34
위조한 root hash  : 4e96c29168bfab003e757fc639765282b1222d45fead5558a3795aee494131e4
Verification of root hash failed.
결과: 신뢰하는 root hash와 맞지 않아 탐지 (exit 1)
결과: 위조 root hash로는 통과
```

- 트리 안에서는 앞뒤가 맞는다. 위조 root hash를 기준으로 삼으면 통과한다
- 막을 수 있는 유일한 지점은 "어느 root hash를 믿는가"다. 그래서 root hash는 서명된 부트 체인이 넘긴다

컨테이너 안에서 직접 해 보려면 셸로 들어간다. 파일은 `/lab/verity`에 있다.

```bash
docker compose exec verity bash
```

## B. 커널 dm-verity (EC2)

환경은 [4-setup-ec2.md](4-setup-ec2.md)다. root 셸에서 실행한다.

### 1. 이미지와 해시 트리 만들기

A와 같은 방법으로 만든다.

```bash
mkdir -p /root/verity/files && cd /root/verity
echo "trusted binary v1" > files/hello.txt
mkfs.ext4 -q -b 4096 -d files data.img 8M
ROOT_HASH=$(veritysetup format data.img hash.img | awk '/Root hash/{print $3}')
echo "$ROOT_HASH"
```

### 2. verity 디바이스로 열고 마운트

loop 디바이스 위에 dm-verity target을 올린다.

```bash
veritysetup open data.img vdata hash.img "$ROOT_HASH"
mkdir -p /mnt/verity && mount -o ro /dev/mapper/vdata /mnt/verity
cat /mnt/verity/hello.txt
```

커널에 올라간 device-mapper 테이블을 본다. Bottlerocket 루트도 같은 형식의 테이블이다.

```bash
dmsetup table vdata
veritysetup status vdata
```

```text
0 16384 verity 1 7:0 7:1 4096 4096 2048 0 sha256 <root hash> <salt>
```

| 필드 | 값 |
|---|---|
| `0 16384` | 시작 섹터, 섹터 수(512바이트 단위, 8MiB) |
| `1` | hash 형식 버전 |
| `7:0 7:1` | 데이터 디바이스, 해시 디바이스(loop) |
| `4096 4096` | 데이터 블록, 해시 블록 크기 |
| `2048 0` | 데이터 블록 수, 해시 시작 블록 |

쓰기로 다시 마운트해 본다. dm-verity 디바이스 자체가 읽기 전용이라 실패한다.

```bash
mount -o remount,rw /mnt/verity
```

### 3. 닫고 변조

마운트를 해제하고, 원본 이미지 파일의 한 바이트를 바꾼다.

```bash
umount /mnt/verity && veritysetup close vdata
OFFSET=$(grep -obUa "trusted binary v1" data.img | head -1 | cut -d: -f1)
printf 'T' | dd of=data.img bs=1 seek="$OFFSET" conv=notrunc status=none
```

### 4. 다시 열고 읽기

해시 트리와 root hash는 그대로다.

```bash
veritysetup open data.img vdata hash.img "$ROOT_HASH"
mount -o ro /dev/mapper/vdata /mnt/verity
ls -l /mnt/verity
cat /mnt/verity/hello.txt
dmesg | tail -3
```

- `open`과 `mount`, `ls`는 성공한다. 슈퍼블록과 디렉터리 블록은 바뀌지 않았기 때문이다
- `cat`만 실패한다. 변조된 블록을 처음 읽는 순간 검증하기 때문이다

```text
cat: /mnt/verity/hello.txt: Input/output error
device-mapper: verity: 7:0: data block 1162 is corrupted
```

### 5. Bottlerocket처럼 재부팅시키기 (선택)

실행하면 인스턴스가 즉시 재부팅된다. SSM 세션도 끊긴다.

```bash
umount /mnt/verity && veritysetup close vdata
veritysetup open --restart-on-corruption data.img vdata hash.img "$ROOT_HASH"
mount -o ro /dev/mapper/vdata /mnt/verity && cat /mnt/verity/hello.txt
```

재접속한 뒤 이전 부팅의 커널 로그에서 원인을 찾는다.

```bash
journalctl -k -b -1 | grep -i verity
```

## 결과 비교

| 확인한 것 | A. Docker | B. EC2 |
|---|---|---|
| 해시 트리 생성, root hash | 됨 | 됨 |
| 변조 블록 위치 | `veritysetup verify`가 byte 위치 출력 | 커널 로그가 블록 번호 출력 |
| 변조를 찾는 시점 | 전체 검사 명령을 실행할 때 | 그 블록을 읽을 때 |
| 변조 후 동작 | 명령 exit code | EIO 또는 재부팅 |

- 확인 필요: B의 출력 예시는 AL2023 커널 기준 예상값이다. 실측하면 이 줄을 지운다
