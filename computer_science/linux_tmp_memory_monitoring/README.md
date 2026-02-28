# /tmp 디렉터리가 메모리 사용률을 올릴 수 있다고?

# 요약

- 리눅스 /tmp 디렉터리는 tmpfs로 마운트되어 있으면 **디스크가 아닌 RAM을 사용**합니다.
- /tmp에 파일을 쓰면 메모리 사용률이 올라갑니다. 메모리 모니터링 알람이 발생할 수 있습니다.
- `free` 명령어의 `shared` 컬럼, `/proc/meminfo`의 `Shmem` 필드에서 확인할 수 있습니다.
- 메모리 모니터링을 할 때 /tmp(tmpfs)에 쌓인 파일도 반드시 의심해야 합니다.

# 목차

1. [이 글을 쓰게 된 계기](#1-이-글을-쓰게-된-계기)
2. [tmpfs란?](#2-tmpfs란)
3. [/tmp와 tmpfs의 관계](#3-tmp와-tmpfs의-관계)
4. [왜 메모리 사용률이 올라갈까?](#4-왜-메모리-사용률이-올라갈까)
5. [메모리 모니터링할 때 주의사항](#5-메모리-모니터링할-때-주의사항)
6. [실습](#6-실습)
7. [참고자료](#7-참고자료)

# 1. 이 글을 쓰게 된 계기

서버 메모리 사용률 알람이 떴는데, 애플리케이션 프로세스의 메모리 사용량은 정상이었습니다. 한참을 삽질하다가 /tmp 디렉터리에 대용량 파일이 쌓여있는 것을 발견했습니다.

그런데, /tmp에 파일이 쌓였다고 메모리가 올라간다고? 디스크 아닌가?

이 의문에서 출발합니다.

# 2. tmpfs란?

tmpfs는 두 가지 단어를 합친 용어입니다. tmp + fs

1. **tmp**: temporary의 약어로, 임시를 의미합니다.
2. **fs**: file system의 약어로, 파일시스템을 의미합니다.

정리하면, **tmpfs는 RAM 기반의 임시 파일시스템**입니다.

일반 파일시스템(ext4, xfs)은 디스크에 데이터를 저장합니다. 반면, tmpfs는 **메모리(RAM)에 데이터를 저장**합니다.

[아키텍처 그림: 일반 파일시스템(디스크 저장) vs tmpfs(RAM 저장) 비교 다이어그램]

tmpfs의 핵심 특징을 정리하면 아래와 같습니다.

| 특징 | 설명 |
|------|------|
| 저장 위치 | RAM (메모리) |
| 속도 | 디스크 대비 매우 빠름 |
| 영속성 | 재부팅하면 데이터가 사라짐 |
| 크기 제한 | 기본값은 전체 RAM의 50% |

## tmpfs는 shared memory 영역을 사용한다

여기서 중요한 점이 있습니다. tmpfs는 리눅스 커널의 **shared memory(공유 메모리)** 영역을 사용합니다.

shared memory는 /proc/meminfo에서 `Shmem` 필드로 확인할 수 있습니다. **tmpfs에 파일을 쓰면 Shmem 값이 증가합니다.**

```bash
# shared memory 확인
grep Shmem /proc/meminfo
```

# 3. /tmp와 tmpfs의 관계

## /tmp는 항상 tmpfs일까?

아닙니다. **배포판과 설정에 따라 다릅니다.**

systemd를 사용하는 최신 리눅스 배포판(Ubuntu 16.04+, CentOS 7+, Amazon Linux 2023 등)은 /tmp를 tmpfs로 마운트하는 경우가 많습니다. 하지만 모든 시스템이 그런 것은 아닙니다.

```bash
# /tmp가 tmpfs인지 확인하는 방법
df -Th /tmp
```

출력 결과에서 Type 컬럼이 `tmpfs`이면 RAM 기반입니다.

```
Filesystem     Type   Size  Used Avail Use% Mounted on
tmpfs          tmpfs  3.9G   44K  3.9G   1% /tmp
```

반면, Type이 `ext4`나 `xfs`이면 디스크 기반입니다. 이 경우에는 /tmp에 파일을 써도 메모리에 영향을 주지 않습니다.

## /dev/shm도 tmpfs다

/tmp 외에도 **/dev/shm** 디렉터리가 있습니다. /dev/shm은 POSIX shared memory를 위한 tmpfs입니다.

```bash
df -Th /dev/shm
```

**/tmp와 /dev/shm 모두 tmpfs로 마운트되어 있다면, 두 곳 모두 메모리를 사용합니다.**

# 4. 왜 메모리 사용률이 올라갈까?

핵심을 정리하면 아래 흐름입니다.

```
/tmp에 파일 쓰기
    ↓
tmpfs가 RAM(shared memory)에 데이터 저장
    ↓
Shmem(shared memory) 증가
    ↓
전체 메모리 사용률(used) 증가
    ↓
메모리 모니터링 알람 발생!
```

## free 명령어로 이해하기

`free` 명령어의 출력을 살펴보겠습니다.

```bash
free -h
```

```
              total        used        free      shared  buff/cache   available
Mem:          7.7Gi       1.2Gi       5.1Gi        44Ki       1.4Gi       6.2Gi
```

여기서 `shared` 컬럼이 핵심입니다. **shared 값은 tmpfs가 사용하는 메모리 크기**입니다.

그런데, 주의해야 할 점이 있습니다. **shared 메모리는 used에 포함**됩니다.

즉, /tmp(tmpfs)에 1GB 파일을 쓰면:
- `shared` 값이 약 1GB 증가
- `used` 값도 약 1GB 증가
- 메모리 사용률이 올라감

## /proc/meminfo로 정확히 확인하기

더 정확한 값은 /proc/meminfo에서 확인할 수 있습니다.

```bash
grep -E "MemTotal|MemAvailable|Shmem:" /proc/meminfo
```

- **MemTotal**: 전체 메모리
- **MemAvailable**: 사용 가능한 메모리
- **Shmem**: shared memory (tmpfs 포함)

**메모리 사용률을 계산할 때 Shmem이 포함된다는 것을 기억해야 합니다.**

# 5. 메모리 모니터링할 때 주의사항

## 주의사항 1: 프로세스 메모리만 보면 안 된다

메모리 알람이 발생했을 때 `top`이나 `ps`로 프로세스 메모리만 확인하는 경우가 많습니다. 하지만 tmpfs에 쌓인 파일은 프로세스 메모리로 잡히지 않습니다.

**프로세스 RSS 합계와 전체 used 메모리가 맞지 않으면, tmpfs(shared memory)를 의심해야 합니다.**

## 주의사항 2: tmpfs 사용량을 함께 모니터링하라

메모리 모니터링 대시보드에 아래 지표를 함께 추가하는 것을 권장합니다.

- `node_memory_Shmem_bytes` (Prometheus node_exporter 기준)
- 또는 `/proc/meminfo`의 `Shmem` 값

## 주의사항 3: /tmp 정리 정책을 확인하라

systemd 기반 시스템은 `systemd-tmpfiles-clean.timer`가 주기적으로 /tmp를 정리합니다.

```bash
# 정리 주기 확인
systemctl cat systemd-tmpfiles-clean.timer
```

기본값은 보통 10일입니다. 즉, /tmp에 쓴 파일이 10일 동안 메모리를 차지할 수 있습니다.

## 주의사항 4: tmpfs 크기 제한을 확인하라

tmpfs는 기본적으로 전체 RAM의 50%까지 사용할 수 있습니다. 8GB 서버라면 최대 4GB까지 /tmp가 메모리를 사용할 수 있습니다.

```bash
# tmpfs 크기 제한 확인
df -h /tmp
```

마운트 옵션에서 size를 지정하여 제한할 수 있습니다.

```bash
# /etc/fstab에서 tmpfs 크기 제한 설정 예시
# tmpfs /tmp tmpfs defaults,size=1G 0 0
```

# 6. 실습

실습 스크립트는 이 디렉터리의 `hands_on.sh` 파일에 있습니다.

실습 순서는 아래와 같습니다.

1. /tmp가 tmpfs인지 확인
2. 현재 메모리 상태 확인
3. /tmp에 대용량 파일 생성
4. 메모리 상태 변화 확인
5. 파일 삭제 후 메모리 복구 확인

```bash
# 실습 실행
bash hands_on.sh
```

# 7. 참고자료

- https://www.kernel.org/doc/html/latest/filesystems/tmpfs.html
- https://man7.org/linux/man-pages/man5/tmpfs.5.html
- https://www.freedesktop.org/software/systemd/man/latest/systemd-tmpfiles.html
- https://man7.org/linux/man-pages/man5/proc_meminfo.5.html
