# 실습 준비

Linux 머신 한 대와 root 권한만 있으면 됩니다. 별도 도구 설치 없이 coreutils(dd, cat, time)와 procps(free)만 사용합니다.

## 요구사항

- Linux 커널 환경 (VM, EC2, WSL2 모두 가능. macOS는 page cache 구조가 달라 재현되지 않습니다)
- root 권한 (`/proc/sys/vm/drop_caches`에 쓰기 위해 필요)
- 여유 디스크 1GB 이상

## 실습 파일 생성

1GB짜리 실습 파일을 만듭니다. /dev/zero에서 1MB 블록을 1024번 복사합니다.

```bash
dd if=/dev/zero of=/tmp/pagecache-test bs=1M count=1024
```

## drop_caches 이해

실습에서 "디스크에서 처음 읽는 상황(cold read)"을 만들기 위해 page cache를 강제로 비웁니다. sync로 아직 디스크에 내려가지 않은 데이터를 먼저 내린 뒤, drop_caches에 3을 써서 page cache와 커널 오브젝트 캐시를 모두 비웁니다.

```bash
sync && echo 3 > /proc/sys/vm/drop_caches
```

drop_caches는 데이터를 잃게 하지는 않지만, 머신 전체의 캐시를 비워 모든 프로세스의 디스크 읽기를 일시적으로 느리게 만듭니다. 운영 중인 서버에서는 실행하지 않습니다.

## 정리

실습이 끝나면 실습 파일을 삭제합니다.

```bash
rm -f /tmp/pagecache-test
```
