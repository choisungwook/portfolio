# akbun-taskq 0.22.1

## Fixed

- Finder에서 연 데스크톱 앱이 `EROFS: read-only file system, mkdir '/data'`로 시작하지 못하던 문제. Finder로 연 앱의 현재 디렉터리는 `/`이고, `TASKQ_HOME`이 없으면 taskq는 현재 디렉터리를 home으로 쓴다. 이제 앱은 셸 프로필에 `TASKQ_HOME`이 없으면 `~/.taskq`를 만들어 home으로 쓴다. 명령줄 실행은 그대로 현재 디렉터리를 쓴다.

## Changed

- 데스크톱 앱의 데이터 폴더가 `~/.taskq`가 됐다(셸 프로필에 `TASKQ_HOME`이 없을 때). 앱과 같은 데이터를 명령줄로 다루려면 `TASKQ_HOME=~/.taskq`를 지정한다. 상대 경로로 적은 `TASKQ_HOME`은 앱이 절대 경로로 바꿔 넘긴다.

## SDK

변경 없음.
