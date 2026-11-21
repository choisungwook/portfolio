# akbun-taskq 0.30.1

## Fixed

- 셸을 쓰는 bot이 Chrome의 DevTools 포트로 자기 브라우저를 직접 조종해 클릭·입력 승인을 건너뛸 수 있던 문제. 이제 bot의 명령이나 파일 도구가 브라우저 프로필(`TASKQ_HOME/browser`)에 닿으면 turn이 멈추고 bot들이 일시정지되며, DevTools 엔드포인트를 찾거나 부르는 명령(`DevToolsActivePort`, `remote-debugging`, `/json/version`, `Input.dispatchMouseEvent` 등)은 거부된다. sandbox를 켠 bot은 브라우저 프로필을 읽을 수도 없다.

## SDK

Claude bot의 sandbox `filesystem.denyRead`에 `TASKQ_HOME/browser`를 더했다.
