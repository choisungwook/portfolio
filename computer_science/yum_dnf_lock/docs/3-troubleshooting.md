# 결과가 다르게 보이면 무엇을 확인해야 할까?

같은 dnf라도 배포판과 버전에 따라 lock 파일 위치, 대기 메시지, timeout 결과가 조금 다르게 보일 수 있습니다. 그러면 무엇부터 확인해야 할까요?

## Docker daemon이 실행 중인가?

`make up`에서 Docker daemon 연결 오류가 나면 실습 컨테이너를 만들 수 없습니다. 먼저 Docker Desktop 또는 로컬 Docker daemon을 실행합니다.

확인 명령은 다음과 같습니다.

```sh
docker compose config
docker ps
```

## 첫 번째 dnf가 너무 빨리 끝나면 어떻게 할까?

`make hold` 뒤에 `make inspect`에서 dnf 프로세스가 보이지 않으면 slow repo delay를 늘려 봅니다. Compose 명령 대신 shell로 들어가 환경변수를 바꿔 실행할 수 있습니다.

```sh
make shell
SLOW_REPO_DELAY_SECONDS=240 bash /workspace/scripts/hold-lock.sh
```

장점은 lock을 관찰할 시간이 길어진다는 점입니다. 단점은 테스트가 오래 걸리고, 종료 시 holder 프로세스를 직접 정리해야 할 수 있다는 점입니다.

## lock 파일 경로가 문서와 다르면 실패일까?

실패로 단정하면 안 됩니다. dnf는 버전과 설정에 따라 lock 후보 파일과 pid 파일 위치가 달라질 수 있습니다. 이 실습의 기준은 특정 파일명 하나가 아니라 다음 세 가지를 같이 보는 것입니다.

- 먼저 실행된 dnf 프로세스가 있는가?
- 두 번째 dnf가 바로 transaction을 진행하지 못하는가?
- contender 로그에 lock 대기 또는 timeout이 남는가?

## 실제 서버에서는 어떻게 판단해야 할까?

실제 서버에서는 먼저 실행 중인 패키지 작업을 확인합니다.

```sh
ps -ef | grep '[d]nf\|[y]um'
```

그 다음 lock을 점유한 프로세스가 정상 작업인지, 멈춘 작업인지 봅니다. 정상 업데이트 중이면 기다리는 것이 안전합니다. 멈춘 프로세스라면 프로세스 상태와 로그를 확인한 뒤 정리해야 합니다.

무작정 lock 파일만 삭제하는 방식은 권장하지 않습니다. 장점은 당장 막힌 명령을 재시도할 수 있다는 점이지만, 단점은 RPM database나 cache 상태가 꼬일 수 있다는 점입니다. 그래서 lock 파일 삭제는 마지막 수단으로 두고, 먼저 점유 프로세스가 살아 있는지 확인합니다.
