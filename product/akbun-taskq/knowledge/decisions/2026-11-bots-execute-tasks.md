---
type: Decision
title: Bots work on their own tasks with per-bot permissions; the run button stays a one-off run
description: Tasks are notes a bot takes and closes in its own session; each bot sets its permission mode (auto), sandbox (off) and blocked commands (none), while taskq's own data is always off limits.
tags: [bots, agents, permissions]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:00:00Z }
---

## 결정

- task는 사용자의 작업 노트다. owner bot이 `start_task`로 가져가 running으로 바꾸고, 자기 세션에서 직접 처리한 뒤 `finish_task`로 done, review, failed 중 하나로 닫는다. 그 실행은 `runs.bot`에 기록되어 Calendar에 나온다.
- task의 시작 버튼은 어느 bot에도 속하지 않는 일회성 실행이다. 지금까지처럼 runner가 task 유형별 권한 프로필과 승인 절차로 한 번 돌린다. 다만 0.31.0부터는 owner가 없는 task에서 시작 버튼이 꺼지고 `POST /tasks/:id/run`도 409를 돌려준다. 실행에는 언제나 맡은 agent가 있어야 한다는 사용자의 지정이다. 큐의 자동 실행(`queue_autorun`)은 이 규칙과 별개로 그대로 둔다.
- 큐는 owner가 있는 task를 자동 실행하지 않는다. owner가 없는 ready task의 자동 실행은 글로벌 설정 `queue_autorun`으로 켜고 끈다. 기본은 켬이다.
- bot마다 권한 모드, 샌드박스, 차단 명령 목록을 설정한다. 기본값은 auto 모드, 샌드박스 없음, 차단 명령 없음이다.
- 설정과 관계없이 모든 bot에서 taskq 자신을 건드리는 호출(데이터 디렉터리, 설정 파일, Claude Code 설정 쓰기, 샌드박스 끄기)은 그 turn을 끝내고 bot 전체를 멈춘다.
- bot은 사용자의 Claude 설정을 읽지 않는다. skill과 plugin은 Plugins 메뉴에 등록하면 모든 bot이 타입에 맞게 쓰고(0.27.0 전에는 bot마다 골랐다, [결정](2026-11-shared-registry-and-signin.md)), bot 폴더 밖에 복사한 사본으로 불러온다. 우클릭 메뉴의 Reload가 사본을 다시 만든다.

## 이유

- 사용자는 task를 bot이 가져가 상태를 바꾸는 노트로 보고, 권한은 bot마다 정하기를 원했다. bot이 읽기만 하고 실제 일을 큐 작업으로 보내던 첫 설계는 권한 경계를 작업 유형별 프로필에 맡겼는데, 그 경계는 이제 bot 설정과 끌 수 없는 tamper 검사가 맡는다. 세션과 mailbox는 [상주 bot 결정](2026-11-resident-agent-team.md)에 있다.
- 기본값을 auto와 샌드박스 없음으로 둔 것은 사용자의 지정이다. auto 모드는 위험한 호출을 모델 쪽 판단으로 거절하므로 아무 검사가 없는 상태는 아니다. 더 좁히는 것은 bot 설정에서 한다.
- taskq 자신을 지키는 검사만은 끌 수 없게 했다. bot이 데이터베이스를 고치면 자기 한도, 승인, 다른 bot의 상태를 바꿀 수 있어서, 다른 설정이 모두 의미가 없어진다. 작업 실행에서 같은 이유로 둔 [tamper 결정](2026-11-tamper-stops-run.md)과 같다.
- 지켜보는 사람이 없는 turn에서 승인을 기다리면 멈춘 채 남는다. 그래서 default 모드에서 승인이 필요한 호출은 기다리지 않고 거절한다. 승인이 필요한 일은 task로 남겨 사용자가 시작 버튼으로 돌리면 기존 승인 화면을 거친다.
- 사용자 Claude 설정을 읽지 않는 이유는 bot이 설정 화면에 보이는 것만으로 동작해야 하기 때문이다. 사용자 설정의 allow 규칙이나 hook이 섞이면 bot 설정만 보고 동작을 예측할 수 없다.
- skill을 사본으로 불러오는 이유는 일하는 중간에 skill이 바뀌지 않게 하고, Reload를 바뀐 내용이 적용되는 시점으로 만들기 위해서다.

## 잃는 것

- 기본값의 bot은 자기 작업 폴더 밖의 파일도 읽고 고칠 수 있다. 샌드박스를 켜야 쓰기가 작업 폴더로 제한된다.
- 차단 명령은 글자 패턴 비교다. 변수 치환, 다른 도구(Write로 스크립트를 쓰고 실행), 다른 표기로 우회할 수 있다. 확실히 막아야 하는 것은 샌드박스와 권한 모드로 막는다.
- bot이 처리한 task에는 runner의 heartbeat와 stale 복구가 없다. taskq가 다시 시작될 때 ready로 돌아가는 것이 복구의 전부다.
