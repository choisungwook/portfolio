# akbun-taskq 0.28.0

## Added

- bot 대화에 작업 과정을 보인다. 메시지 사이에 bot이 부른 도구를 "실행함 Bash git fetch…", "실행됨 도구 N개" 한 줄로 접어 두고, 누르면 목록이 펼쳐진다. 일하는 중인 묶음은 도는 점 네 개, 지금 부르는 도구, 경과 초로 보인다. Claude bot은 PreToolUse hook에서, OpenAI bot은 도구를 실행하기 전에 기록하고(`team_turn_steps`, migration 012), `GET /api/bots/:name/steps`로 읽는다.
- 설정 > 업데이트에서 설치를 누르면 진행 막대와 퍼센트가 보인다(`GET /api/update/progress`).
- 설정, bot 설정, 메모리, 작업, 새 작업, 실행 창에 macOS식 닫기·내리기 버튼을 달았다. 내린 창은 화면 왼쪽 아래 칩으로 남고 누르면 다시 열린다. 확대 버튼은 없다.
- 대화 머리글 버튼에 이름과 단축키 툴팁, 단축키(파일 ⇧⌘F, 브라우저 ⇧⌘B, bot 설정 ⇧⌘,)를 더했다.
- 데스크톱 앱에서 Cmd +/-/0으로 화면을 확대·축소한다.
- bot 대화 오른쪽에 그 bot이 연 PR 중 열린 것(변경 사항)과 백그라운드 작업(하위 세션, 끝나지 않은 작업, 오늘 끝난 수)을 보인다(`GET /api/bots/:name/activity`, PR 상태는 `gh pr view`).

## Changed

- 대화 머리글의 파일 버튼 아이콘을 폴더 모양으로 바꿨다.
- 모델 메뉴에서 "기본 모델"과 SDK의 "Default (recommended)"를 뺐다. 모델을 바꾸려 하면 대화 전체가 새 모델로 다시 전송되어 비용이 늘고 먼저 /compact를 권하는 확인 창이 뜨고, 확인해야 바뀐다. 바뀌면 대화에 "Model changed: A → B"와 skill·plugin 다시 불러오기 메모가 남는다.
- 슬래시 명령과 @ 목록, + 메뉴가 입력창 너비에 맞는다.
- 입력창 아래 모델·effort·권한 메뉴를 테두리 없는 글자와 화살표로 바꾸고 입력창 가장자리에 맞췄다.
- 설정 > 폴더의 공용 폴더, taskq 데이터 폴더, 세션 대화 기록을 절 제목(H2)으로, 런타임 이름을 소절(H3)로 바꿨다.
- 스크롤바를 얇게 줄였다.
- task 상태보드를 초안부터 시작하는 순서로 두 줄에 놓고 열 사이에 화살표를 그렸다. 카드는 흰 타일로 바꿔 열 배경과 구별된다.

## Fixed

- bot 대화를 끝까지 스크롤하면 페이지가 함께 움직여 오른쪽 파일 창까지 스크롤되던 문제. 대화 화면이 창 높이에 맞고 각 열이 따로 스크롤한다.

## Removed

- bot 설정의 Limits(turn당 모델 턴 수)를 없앴다. 모든 bot이 `taskq.config.json`의 `bots.turnMaxTurns`를 따르고, migration 012가 `team_agents.turn_max_turns` 열을 지운다.

## SDK

변경 없음.
