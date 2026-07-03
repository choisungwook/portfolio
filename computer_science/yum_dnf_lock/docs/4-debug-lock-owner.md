# lock 점유 프로세스 확인하기

lock 문제의 다음 질문은 소유자입니다.

패키지 설치가 lock 때문에 멈췄다면 파일을 지우기 전에 누가 잡고 있는지 봐야 합니다. lock 파일 안의 PID만 믿으면 위험합니다. 프로세스가 이미 종료됐거나, 같은 PID를 다른 프로세스가 재사용했을 수 있습니다. 그래서 파일 내용과 실제 점유 프로세스를 함께 봅니다.

실습 준비는 [1. 실습 준비](./1-setup.md)를 따릅니다.

## 어떻게 확인할까요?

먼저 실행 대상을 띄우고 lock holder를 백그라운드로 실행합니다.

```bash
docker run --rm --name yum-dnf-lock-debug-lab -d yum-dnf-lock-lab sleep infinity
docker exec -d yum-dnf-lock-debug-lab /lab/scripts/hold-dnf-lock.sh /var/cache/dnf/metadata_lock.pid 60
```

lock 후보 파일과 점유 프로세스를 봅니다.

```bash
docker exec yum-dnf-lock-debug-lab /lab/scripts/show-locks.sh
```

스크립트는 후보 lock 파일을 확인하고 `fuser`, `lsof`, `ps` 결과를 함께 출력합니다.

```text
/var/cache/dnf/metadata_lock.pid
/var/lib/dnf/rpmdb_lock.pid
/run/dnf.pid
/var/run/dnf.pid
```

출력에서 봐야 할 핵심은 두 가지입니다.

```text
== lock files ==
--- /var/cache/dnf/metadata_lock.pid
...

== package manager processes ==
PID PPID STAT COMMAND COMMAND
...
```

## 바로 종료해도 될까요?

바로 kill하는 것은 마지막 선택지입니다. 막힌 자동화를 빠르게 풀 수 있지만, 실제 패키지 transaction 중간에 끊으면 rpm database나 설치 상태를 더 나쁘게 만들 수 있습니다. 실제 서버에서는 `ps`, 로그, 실행 시간을 보고 정상 작업인지 멈춘 작업인지 먼저 구분해야 합니다.

정리 명령입니다.

```bash
docker rm -f yum-dnf-lock-debug-lab
```

## 무엇을 남겨야 할까요?

yum/dnf lock 문제를 볼 때는 파일 삭제보다 소유자 확인이 먼저입니다.

## 참고자료

- `fuser -v <file>`: 파일을 사용하는 프로세스 확인
- `lsof <file>`: 파일 descriptor 관찰
- `ps -eo pid,ppid,stat,comm,args`: 프로세스 상태 확인
