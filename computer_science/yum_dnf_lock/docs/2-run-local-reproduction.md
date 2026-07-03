# Docker Compose로 lock 경합 재현하기

## TL;DR

`lock-holder` 컨테이너가 dnf metadata lock을 잡고, `competitor` 컨테이너가 같은 lock을 필요로 하는 dnf 명령을 실행합니다. `LOCK_TIMEOUT` 안에 lock을 얻지 못하면 dnf는 실패하거나 대기 메시지를 남깁니다.

## 왜 Docker Compose로 재현할까

패키지 매니저 lock은 host에서 직접 실험하면 작업 중인 OS 패키지 상태에 영향을 줄 수 있습니다. Docker Compose를 사용하면 실험 범위가 컨테이너와 volume 안으로 제한됩니다.

이 선택의 장점은 host 환경을 오염시키지 않고 반복할 수 있다는 점입니다. 단점은 실제 VM이나 EC2에서 systemd timer, cloud-init, 관리형 agent가 동시에 패키지 작업을 잡는 상황까지는 포함하지 못한다는 점입니다.

## 실습 환경을 어떻게 띄울까

다음 명령은 Amazon Linux 2023 기반 실습 컨테이너를 빌드하고 대기 상태로 실행합니다.

```bash
make up
```

Compose 설정만 먼저 확인하려면 다음 명령을 사용합니다.

```bash
make config
```

## lock은 어떻게 잡을까

다음 명령은 `lock-holder` 컨테이너를 띄워 `/var/cache/dnf/metadata_lock.pid`를 120초 동안 점유합니다.

```bash
make hold
```

lock holder 로그는 다음 명령으로 확인합니다.

```bash
make logs
```

정상이라면 `locked /var/cache/dnf/metadata_lock.pid`와 남은 시간이 출력됩니다.

## 경쟁 dnf 명령은 어떻게 실패할까

lock을 잡은 상태에서 다음 명령을 실행합니다.

```bash
make compete
```

`competitor`는 아래 명령을 실행합니다.

```bash
dnf --setopt=lock_timeout="${LOCK_TIMEOUT}" --setopt=metadata_timer_sync=0 makecache
```

기본 `LOCK_TIMEOUT`은 5초입니다. lock holder가 아직 lock을 잡고 있다면 dnf는 lock을 기다리다가 실패하거나 lock 대기 메시지를 남깁니다. 정확한 메시지는 dnf 버전에 따라 달라질 수 있어 `확인 필요`입니다.

## timeout을 바꾸면 무엇이 달라질까

다음 명령은 경쟁 dnf가 1초만 기다리게 합니다.

```bash
LOCK_TIMEOUT=1 make compete
```

짧은 timeout은 자동화에서 빠르게 실패를 보게 해 줍니다. 반대로 lock을 잡은 프로세스가 곧 끝날 가능성이 크다면 너무 짧은 timeout은 불필요한 실패를 늘릴 수 있습니다.

## 정리 명령은 무엇일까

실습이 끝나면 다음 명령으로 컨테이너와 volume을 제거합니다.

```bash
make down
```

`make down`은 dnf cache와 rpm database volume도 함께 지웁니다. 이전 실습 상태를 남기고 싶다면 `docker compose down`만 직접 실행해야 합니다.
