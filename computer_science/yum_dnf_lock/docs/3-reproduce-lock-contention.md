# docker 명령어로 lock 경합 재현하기

lock 대기는 직접 만들어 보면 더 빨리 이해됩니다.

패키지 매니저 lock은 운영 서버에서만 만나는 문제처럼 느껴집니다. 이 실습은 lock holder를 먼저 띄우고, 그 뒤에 `dnf makecache`를 실행해 대기 상황을 만듭니다. 목표는 에러 문구를 외우는 것이 아니라, lock 경합이 출력에서 어떻게 보이는지 확인하는 것입니다.

실습 준비는 [1. 실습 준비](./1-setup.md)를 따릅니다.

## 어떤 파일이 실행될까요?

세 가지 스크립트가 역할을 나눕니다.

| 파일 | 역할 |
| --- | --- |
| `scripts/hold-dnf-lock.sh` | dnf metadata lock 후보 파일을 잡고 일정 시간 대기합니다 |
| `scripts/run-lock-race.sh` | lock holder를 띄운 뒤 `dnf makecache`를 실행해 경합을 만듭니다 |
| `scripts/show-locks.sh` | lock 파일과 점유 프로세스를 출력합니다 |

## 어떻게 실행할까요?

기본 lock 후보 파일로 경합을 재현합니다.

```bash
docker run --rm yum-dnf-lock-lab /lab/scripts/run-lock-race.sh
```

다른 후보 경로를 실험할 때는 `DNF_LOCK_FILE`을 넘깁니다.

```bash
docker run --rm -e DNF_LOCK_FILE=/run/dnf.pid yum-dnf-lock-lab /lab/scripts/run-lock-race.sh
```

lock holder 시간을 늘릴 때는 `SLEEP_SECONDS`를 넘깁니다.

```bash
docker run --rm -e SLEEP_SECONDS=40 yum-dnf-lock-lab /lab/scripts/run-lock-race.sh
```

## 결과를 어떻게 해석할까요?

`dnf_status=124`는 `timeout 8s` 안에 `dnf makecache`가 끝나지 않았다는 뜻입니다. 실습에서는 이 상태를 `result=dnf_waited_for_lock`로 표시합니다.

다른 status가 나오면 출력과 lock 경로를 같이 봐야 합니다. dnf가 다른 lock 파일을 쓰거나, cache가 최신이라 lock을 짧게 잡고 끝났을 수 있습니다.

## 무엇을 재현한 걸까요?

이 실습은 동시에 실행된 패키지 작업 중 하나가 lock 때문에 진행하지 못하는 상황을 재현합니다. 다음 문서에서는 그 lock을 누가 잡고 있는지 확인합니다.

## 참고자료

- `docker run`: image에서 명령 실행
- `timeout`: lock 대기 여부를 짧은 시간 안에 관찰하기 위한 명령
