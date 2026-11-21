# akbun-taskq 0.12.0

bot이 사람 없이 일하는 범위를 넓히고, 사람이 결정하거나 해야 하는 곳에서는 멈추게 한다. 처음 읽는 agent는 `wiki/architecture.md`의 "Bots on their own" 절을 먼저 읽는다.

## Added

- 먼저 묻기: 되돌릴 수 없는 명령(push, publish, release, `terraform apply`·`destroy`, `kubectl apply`·`delete`, helm, `docker push`, `aws … delete-`·`terminate-`. `git -C repo push`처럼 사이에 옵션이 있어도)과 bot 설정의 "먼저 묻기" 패턴(`tool:<이름>`으로 MCP 도구도)은 실행되지 않고 Must check에 승인 요청으로 뜬다. 알림에 호출 전체가 보이고, "한 번 승인"하면 그 호출이 한 번만 통과하며, 거부하면 bot이 듣는다. 4,000자가 넘는 호출은 승인할 수 없다. bypass 모드는 기본 목록만 건너뛴다. 차단 명령처럼 글자 비교라서 사고를 막는 장치이지 경계는 아니다.
- routine: bot마다 cron 일정(로컬 시간)이나 트리거(작업 실패, 새 작업, webhook)로 도는 일. bot 설정에서 추가하거나 bot에게 대화로 부탁한다(`schedule_routine`). 놓친 실행은 한 번만 온다.
- bot 헌장: 맡는 일, 좋은 결과, 묻지 않고 하지 말 것. 지시문에 붙는다.
- 설정의 주간 점검: bot·routine별로 돌았는지와 성공률, 끌 후보와 끄기 버튼, 직접 확인할 최근 결과 5개.
- 목표: 왼쪽 메뉴에서 목표와 완료 조건을 주면 taskq가 bot에게 나눠 맡기고 `close_goal`로 요약과 함께 닫는다.
- 끝난 작업을 workflow로 저장: 작업 상세의 "Save as workflow"가 의도, 마지막 실행 요약, 쓴 명령과 고친 파일로 workflow 초안을 만들고 편집기를 연다.
- 교차 확인: "Needs a second check" 작업은 owner가 끝내면 review로 가고, 다른 reviewer bot이 `review_task`로 승인하거나 반려해야 done이 된다. reviewer bot이 없으면 사용자가 확인한다.
- API와 operation: `/bot-approvals`, `/routines`, `/goals`, `/review`, `/tasks/:id/save-workflow`.

## Changed

- bot 대화 오른쪽의 연결 패널을 뺐다. 연결은 설정의 연결 페이지에서 보고, 왼쪽 bot 목록의 이름 옆 점이 연결 상태를 보인다(초록 연결됨, 빨강 실패). 대답할 수 없는 이유는 계속 대화 안에 나온다.
- bot 목록과 대화 머리의 설정 톱니를 키우고 항상 보이게 했다(전에는 마우스를 올릴 때만 보였다).
- bot의 꺼짐 모드(`bots.enabled`)를 없앴다. bot은 taskq와 함께 항상 돌고, 멈추려면 메뉴의 Pause나 `taskq bots pause`를 쓴다. 기존 설정 파일의 `bots.enabled`는 무시한다. 연결 페이지와 bot 패널의 "bot이 꺼져 있음" 안내도 뺐다.
- 스키마 010: `team_agents`에 헌장과 `ask_first`, `bot_approvals`, `bot_routines`, `goals`, `team_messages.routine_id`.

## Fixed

- 사용자가 말을 건 bot이 "설정상 사용자에게 직접 메시지를 보낼 수 없으니 taskq를 통해 전달해 달라"고 답하던 문제. 사용자가 그 bot에게 한 번이라도 말을 걸었으면 bot은 사용자에게 직접 답한다. "May start a conversation with me" 설정(`may_message_user`)은 bot이 먼저 말을 거는 경우만 정한다. 지시문에도 사용자에게 직접 답하라고 적었다.
- bot이 일할 때 왼쪽 bot 목록이 흔들리던 문제. 목록을 몇 초마다 통째로 다시 그려 바쁜 bot의 회전 고리와 점이 처음부터 다시 돌았고, context 원이 있는 행(66px)과 없는 행(64px)의 높이가 달라 원이 생기면 아래 행이 밀렸다. 이제 보이는 내용이 바뀔 때만 다시 그리고 스크롤 위치를 유지하며, 두 줄의 높이를 고정했다.

## SDK

`@anthropic-ai/claude-agent-sdk`와 `@openai/agents-core`: 사용 방식 변경 없음. 먼저 묻기는 기존 `PreToolUse` hook(Claude)과 로컬 도구 게이트(OpenAI)에서 `botGate`가 판단한다. Codex와 Kiro bot의 자체 도구는 이 게이트를 지나지 않는다.

## Not verified with a real model

- 실제 모델이 `schedule_routine`, `review_task`를 지시문대로 부르는지는 돌려 보지 않았다. 가짜 backend와 도구 호출 테스트로만 확인했다.
