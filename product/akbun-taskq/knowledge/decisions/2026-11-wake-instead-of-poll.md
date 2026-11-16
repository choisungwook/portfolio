---
type: Decision
title: The runner waits on an in-process wake signal with a 60 second fallback
description: pollSec went from 2 to 60 seconds; API writes, run ends and event writes wake waiters at once.
tags: [runner, performance]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-16T00:00:00Z }
---

## 결정

- `pollSec` 기본값을 2초에서 60초로 바꾼다.
- 같은 프로세스의 변경은 `src/wake.ts`의 신호로 대기를 즉시 깨운다. `queueChanged`는 API 쓰기, run 종료, run-now 요청이, `eventWritten`은 `insertEvent`가 알린다. runner는 앞의 것을, 승인 대기와 SSE는 뒤의 것을 기다린다.
- CLI처럼 다른 프로세스의 변경은 60초 fallback에서 반영된다.

## 이유

- 사용자가 2초 폴링을 시스템 부하로 보고 1분으로 바꾸기로 했다. 실제로 2초 폴링은 SQLite 인덱스 조회 몇 개라 부하가 작았지만, 실행 중인 작업이 없어도 하루 4만 번 이상 깨어난다.
- 간격만 늘리면 화면에서 만든 작업, 승인, 취소가 최대 1분 늦게 반영된다. 반영 지연은 같은 프로세스 신호로 없애고, 다른 프로세스 변경만 1분을 감수한다.
- 파일 감시나 SQLite update hook은 다른 프로세스의 쓰기를 확실히 잡지 못하거나 `node:sqlite`에서 쓸 수 없어 고르지 않았다.
