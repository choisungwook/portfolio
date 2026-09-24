# dm-verity 해시 트리를 손으로 다시 계산하기

`veritysetup format`이 만든 root hash를 hashlib만 쓰는 Python 스크립트로 똑같이 계산하고, 바이트 하나를 바꿔 어느 블록에서 검증이 실패하는지 확인한다. 환경은 [3-setup-local.md](3-setup-local.md)다.

- 아래 출력은 veritysetup 2.7.0에서 실측한 값이다
- 데이터와 salt를 고정했으므로 같은 root hash가 나와야 한다. UUID만 매번 다르다

## 1. 컨테이너에 들어가기

```bash
docker exec -it verity-lab bash
cd /work
```

## 2. 데이터 이미지 만들기

`seq` 출력을 4,096,000바이트(블록 1000개)로 자른다. 같은 명령이면 같은 바이트가 나온다.

```bash
seq 1 1000000 | head -c 4096000 > data.img
ls -l data.img
```

실행 결과다.

```text
-rw-r--r-- 1 root root 4096000 data.img
```

## 3. 해시 트리 만들기

salt를 고정 문자열의 sha256으로 정한다. 생략하면 veritysetup이 무작위 salt를 만든다.

```bash
SALT=$(printf 'akbun-selinux-handson' | sha256sum | cut -c1-64)
veritysetup format --salt=$SALT data.img hash.img | tee format.txt
ROOT=$(awk '/^Root hash/{print $3}' format.txt)
```

실행 결과다.

```text
VERITY header information for hash.img
Hash type:        1
Data blocks:      1000
Data block size:  4096
Hash blocks:      9
Hash block size:  4096
Hash algorithm:   sha256
Salt:             609e6aa00a2b9e424dee7b94239150790d11f05f0cbe3233989c22364add1091
Root hash:        047e8d4d100da70754bab77b91688358d8ab1bf361e84c701e006b9cee7f8aad
Hash device size: 40960 [bytes]
```

- Hash blocks 9 = level 0의 8개(1000/128 올림) + level 1의 1개
- Hash device size 40960 = superblock 1블록 + 해시 블록 9개

## 4. root hash를 직접 계산하기

[verity_tree.py](../dm-verity-lab/verity_tree.py)는 `sha256(salt || 블록)`을 level마다 반복한다. veritysetup을 쓰지 않는다.

```bash
python3 /lab/verity_tree.py data.img --salt $SALT
```

실행 결과다.

```text
data blocks : 1000
level 0 hash blocks : 8
level 1 hash blocks : 1
hash blocks total : 9
root hash : 047e8d4d100da70754bab77b91688358d8ab1bf361e84c701e006b9cee7f8aad
```

- 3단계의 Root hash와 같다. dm-verity format 1의 계산식이 이것뿐이라는 확인이다
- 데이터 블록 20,000개로 늘리면 level 2가 생긴다. 같은 스크립트로 해시 블록 160개, root hash 일치까지 확인했다

## 5. hash device 안을 들여다보기

오프셋 8192(superblock, level 1 다음)의 첫 32바이트가 데이터 블록 0의 해시다.

```bash
head -c 6 hash.img; echo
od -A d -t x1 -j 8192 -N 32 hash.img
python3 -c "import hashlib;s=bytes.fromhex('$SALT');print(hashlib.sha256(s+open('data.img','rb').read(4096)).hexdigest())"
```

실행 결과다.

```text
verity
0008192 ed dc 48 fb 0c 55 d7 92 76 0a 04 8a 9f bc d1 08
0008208 e1 18 35 8c 0b ce 41 2f a5 02 92 c7 ca b4 6f 01
eddc48fb0c55d792760a048a9fbcd108e118358c0bce412fa50292c7cab46f01
```

- 첫 6바이트는 superblock 매직 `verity`다
- level 0 해시가 뒤쪽에 있다. 상위 level이 앞에 온다

## 6. 검증 통과

```bash
veritysetup verify data.img hash.img $ROOT && echo "verify ok"
```

실행 결과다.

```text
verify ok
```

## 7. 바이트 하나를 바꾸고 다시 검증

블록 777의 101번째 바이트를 `X`로 바꾼다.

```bash
cp data.img tampered.img
printf 'X' | dd of=tampered.img bs=1 seek=$((4096*777+100)) conv=notrunc status=none
veritysetup verify tampered.img hash.img $ROOT; echo "exit=$?"
```

실행 결과다.

```text
Verification failed at position 3182592.
Verification of data area failed.
exit=2
```

- 3182592 = 4096 × 777. 바꾼 바이트가 속한 블록의 시작 위치를 정확히 가리킨다
- 변조한 이미지로 root hash를 다시 계산하면 전혀 다른 값이 나온다

```bash
python3 /lab/verity_tree.py tampered.img --salt $SALT | tail -1
```

실행 결과다.

```text
root hash : 2614845a2fafa181e96302d4ab646fd90f224b62d8c9277d11fdae857108fd96
```

## 정리

- root hash는 데이터 전체의 요약이다. 바이트 1개만 달라도 root hash가 달라진다
- `verify`는 전체를 훑지만, 커널의 dm-verity는 읽는 블록의 경로만 검증한다. 그 차이는 [7-dm-verity-kernel-handson.md](7-dm-verity-kernel-handson.md)에서 본다
- 공격자가 `hash.img`까지 다시 만들면 `verify`는 통과한다. 그래서 root hash를 디스크 밖(서명된 커널 cmdline)에 둔다
