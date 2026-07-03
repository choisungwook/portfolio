# Docker Compose로 lock 경합을 어떻게 재현할까?

패키지 매니저 lock은 실제 서버에서 마주치면 불편하지만, 일부러 재현해 보면 원리는 단순합니다. 첫 번째 dnf가 오래 실행되는 동안 두 번째 dnf를 실행하면 됩니다.

## 실습 환경은 어떻게 준비할까?

다음 명령은 CentOS Stream 9 기반 컨테이너를 빌드하고, dnf를 실행할 lab 컨테이너를 띄웁니다.

```sh
make up
```

컨테이너에는 관찰용 명령도 같이 들어갑니다.

- `ps`: 실행 중인 dnf 프로세스를 확인합니다.
- `lsof`: dnf cache 디렉터리를 열고 있는 프로세스를 확인합니다.
- `fuser`: 특정 경로를 사용하는 프로세스를 확인합니다.

## 첫 번째 dnf는 어떻게 lock을 오래 잡을까?

다음 명령은 컨테이너 안에서 느리게 응답하는 local repo 서버를 띄우고, dnf metadata 갱신을 시작합니다.

```sh
make hold
```

`make hold`는 background exec로 실행됩니다. 바로 다음 명령으로 현재 dnf 프로세스를 확인합니다.

```sh
make inspect
```

예상 관찰 포인트는 다음과 같습니다.

```text
== dnf processes ==
root ... dnf -y makecache ...

== lock and pid candidates ==
/var/cache/dnf/...
```

lock 후보 경로는 dnf 버전과 배포판에 따라 달라질 수 있습니다. 경로가 다르면 실패가 아니라 `확인 필요` 대상입니다. 이 실습에서는 프로세스와 두 번째 dnf의 대기 메시지를 함께 봅니다.

## 두 번째 dnf를 실행하면 무엇이 보일까?

첫 번째 dnf가 아직 실행 중일 때 다음 명령을 실행합니다.

```sh
make contend
```

두 번째 dnf는 lock을 바로 얻지 못합니다. 환경에 따라 lock 대기 메시지가 나오거나, timeout으로 종료됩니다.

```text
contender timed out while waiting for the dnf lock
```

이 출력은 두 번째 dnf가 같은 시스템 상태를 동시에 수정하지 못하고 기다렸다는 뜻입니다.

## 한 번에 검증하려면 어떻게 할까?

다음 명령은 lock holder 실행, 프로세스 관찰, contender 실행을 한 번에 수행합니다.

```sh
make test
```

성공하면 마지막에 다음 메시지를 확인할 수 있습니다.

```text
lock contention observed
```

## 실습 환경은 어떻게 정리할까?

컨테이너와 volume을 정리합니다.

```sh
make down
```
