# akbun-taskq 0.20.0

## Changed

- bot의 예산 기능을 없앴다. 하루 예산(`daily_budget_usd`, `bots.dailyBudgetUsd`), turn당 예산(`turn_budget_usd`, `bots.turnBudgetUsd`, bot별 값 포함), 사이드바의 "Budget N%" 표시, `GET /api/bots`의 `budget`이 사라졌다. bot은 예산 때문에 멈추지 않고, 비용 값 없이 끝난 turn은 0으로 기록한다. bot을 묶는 한도는 시간당 turn, turn당 모델 턴, 재시도 횟수, 대화 크기다. 설정 파일에 남은 예산 키는 무시한다. 큐가 실행하는 작업의 `maxBudgetUsd`는 그대로다.
- bot 설정 창에서 Model 입력을 뺐다. 모델은 대화 입력창 아래의 메뉴에서 고른다.

## Fixed

- 설정 > 연결에서 다시 확인해 "연결됨"이 되어도 bot은 그대로 꺼져 있던 문제. 로그인이 실패하면 taskq가 그 bot을 끄는데(Claude는 bot 전체를 멈춤), 다시 로그인해도 켜 주는 곳이 없었다. 이제 다시 확인한 검사가 통과하면 로그인 실패로 꺼진 bot을 다시 켜고, Claude 로그인 실패로 멈춘 bot 전체를 다시 돌린다. 사용자가 직접 끈 bot은 그대로 둔다. 다시 확인 직후 사이드바의 연결 표시와 열려 있는 대화의 안내도 바로 갱신한다.
- bot 대화의 모델·effort·권한 메뉴를 열어 두면 5초쯤 뒤에 닫히던 문제. 5초마다 도는 갱신이 메뉴 줄을 통째로 다시 그렸다. 이제 보이는 값이 바뀔 때만 다시 그린다.

## SDK

Claude Agent SDK의 bot turn 호출에서 `maxBudgetUsd` 옵션을 뺐다. 그 밖의 SDK 사용 변경 없음.
