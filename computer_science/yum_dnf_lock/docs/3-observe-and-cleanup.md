# lock 점유 프로세스 확인과 정리

## TL;DR

lock 파일만 보면 어떤 프로세스가 문제인지 바로 판단하기 어렵습니다. `ps`, `lsof`, `fuser`로 lock 파일과 프로세스를 함께 확인해야 합니다.

## lock 파일만 보면 왜 부족할까

lock 파일에는 pid가 남아 있을 수 있습니다. 하지만 프로세스가 종료된 뒤 파일만 남았거나, 컨테이너/namespace 경계 때문에 host에서 보는 pid와 컨테이너 안에서 보는 pid가 다를 수 있습니다.

그래서 lock 파일을 볼 때는 파일 내용과 실제 프로세스 존재 여부를 함께 확인해야 합니다. **파일이 남아 있다는 사실과 lock이 실제로 잡혀 있다는 사실은 같은 말이 아닙니다.**

## 점유 프로세스는 어떻게 확인할까

`dnf-lab` 컨테이너 안에서 lock 파일을 기준으로 pid, 열린 파일, 파일 사용자 정보를 확인합니다.

```bash
make observe
```

이 명령은 내부적으로 다음 스크립트를 실행합니다.

```bash
/workspace/scripts/show_lock_owner.sh
```

스크립트는 먼저 lock 파일 내용을 출력하고, pid가 실행 중이면 `ps`로 프로세스 정보를 보여줍니다. 그 다음 `lsof`와 `fuser`로 lock 파일을 사용하는 프로세스를 확인합니다.

## lock holder를 멈추면 무엇을 봐야 할까

lock holder를 멈추려면 다음 명령을 실행합니다.

```bash
docker compose stop lock-holder
```

그 뒤 다시 경쟁 dnf 명령을 실행합니다.

```bash
make compete
```

lock holder가 멈췄다면 dnf는 lock을 얻고 `makecache`를 계속 진행합니다. 네트워크나 mirror 상태 때문에 metadata 다운로드가 실패할 수 있는데, 이 경우는 lock 경합과 별개의 문제입니다.

## stale lock은 바로 지워도 될까

바로 지우는 것은 마지막 선택에 가깝습니다. 먼저 pid가 살아 있는지 보고, 살아 있다면 그 프로세스가 어떤 패키지 작업을 하는지 확인해야 합니다. 실제로 작업 중인 dnf를 강제로 중단하면 RPM database나 설치 중인 파일 상태가 애매해질 수 있습니다.

stale lock으로 판단할 수 있는 조건은 다음과 같습니다.

- lock 파일에 적힌 pid가 존재하지 않는다.
- `lsof`와 `fuser`에서 lock 파일 점유 프로세스가 보이지 않는다.
- 현재 host나 컨테이너에서 실행 중인 `dnf`, `yum`, `rpm` 작업이 없다.

이 조건을 확인한 뒤에도 운영 서버라면 작업 이력과 자동 업데이트 timer를 같이 확인해야 합니다. 배포판마다 자동 업데이트 서비스 이름은 다를 수 있어 `확인 필요`입니다.

## 참고자료

- `ps`, `lsof`, `fuser` manual page
- dnf lock 파일과 stale lock 처리 기준: 확인 필요
