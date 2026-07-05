# Linux 명령어로 lock 파일 잡고 풀기

lock 파일은 파일 내용보다 파일을 잡고 있는 프로세스가 더 중요합니다.

`yum`이나 `dnf` lock을 처음 보면 `/var/cache/dnf/metadata_lock.pid` 같은 파일이 먼저 보입니다. 그래서 파일을 만들면 lock이 걸리고, 파일을 지우면 lock이 풀린다고 이해하기 쉽습니다. 이 실습은 `flock`으로 "파일 존재"와 "파일 lock"이 다르다는 점을 확인합니다.

실습 준비는 [1. 실습 준비](./1-setup.md)를 따릅니다.

## 어떻게 lock을 잡을까요?

실행 대상을 띄우고 `flock` 명령을 확인합니다.

```bash
docker run --rm --name yum-dnf-lock-command-lab -d yum-dnf-lock-lab sleep infinity
docker exec yum-dnf-lock-command-lab sh -c 'command -v flock'
```

lock 파일을 만들고 exclusive lock을 잡습니다. `touch`는 파일을 만들 뿐이고, 실제 lock은 `flock`이 잡습니다.

```bash
docker exec -d yum-dnf-lock-command-lab sh -c 'touch /tmp/akbun.lock && flock /tmp/akbun.lock sleep 60'
```

같은 파일에 non-blocking lock을 시도합니다.

```bash
docker exec yum-dnf-lock-command-lab sh -c 'flock -n /tmp/akbun.lock echo "lock acquired" || echo "lock busy"'
```

`lock busy`가 출력되면 파일이 있어서 실패한 것이 아닙니다. 그 파일을 기준으로 이미 다른 프로세스가 lock을 잡고 있어서 실패한 것입니다.

## 어떻게 lock을 풀까요?

lock은 파일 삭제가 아니라 프로세스와 파일 descriptor 수명에 묶여 있습니다. lock holder 프로세스를 종료합니다.

```bash
docker exec yum-dnf-lock-command-lab pkill -f 'flock /tmp/akbun.lock sleep 60'
```

다시 같은 파일에 lock을 시도합니다.

```bash
docker exec yum-dnf-lock-command-lab sh -c 'flock -n /tmp/akbun.lock echo "lock acquired" || echo "lock busy"'
```

이번에는 `lock acquired`가 출력됩니다. 파일은 남아 있을 수 있지만 lock은 풀렸습니다. 실습 파일과 실행 대상을 정리합니다.

```bash
docker exec yum-dnf-lock-command-lab rm -f /tmp/akbun.lock
docker rm -f yum-dnf-lock-command-lab
```

## `flock`이 없다면 어떻게 볼까요?

다른 Linux 환경에서 `flock` 명령이 없다면 Python의 `fcntl` 도움을 받을 수 있습니다. 실행 명령은 `python`을 사용합니다.

```bash
docker run --rm yum-dnf-lock-lab python -c 'import fcntl, time; handle = open("/tmp/akbun-python.lock", "w+"); fcntl.lockf(handle, fcntl.LOCK_EX); print("python lock acquired", flush=True); time.sleep(10)'
```

Python을 써도 원리는 같습니다. 파일 경로는 프로세스들이 만나는 약속 장소이고, 진짜 lock 상태는 커널이 관리합니다.

## 무엇을 기억해야 할까요?

lock 파일은 신호등이 아니라 신호등을 세운 위치에 가깝습니다. 파일 내용만 보지 말고, 어떤 프로세스가 그 파일을 기준으로 lock을 잡고 있는지 같이 봐야 합니다.

## 참고자료

- `man flock`: 로컬 환경에서 확인 필요
- `man fcntl`: 로컬 환경에서 확인 필요
- `man lsof`: 로컬 환경에서 확인 필요
