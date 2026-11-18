---
type: Decision
title: Bots share one folder, keep memory and settings in SQLite, and cancel a turn without retrying it
description: The shared folder is mounted into every bot session; uploads stay JSON; memory, limits, language and theme live in SQLite; a cancelled turn's work is not replayed.
tags: [bots, storage, ui]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T19:00:00Z }
---

## 결정

- `TASKQ_HOME/shared`를 모든 bot 세션의 `additionalDirectories`로 넘긴다. 첨부파일은 `shared/attachments/<날짜>/<id>-<이름>`에 저장하고, 메시지와 task에는 이 폴더 기준 경로만 남긴다. task 실행은 유형과 관계없이 이 폴더를 읽을 수 있지만 쓸 수는 없다.
- 업로드는 base64를 담은 JSON(`POST /api/files`, 20 MB)이다. multipart를 받지 않는다.
- bot 메모리는 `team_agents.memory`에 두고 매 turn system prompt 끝에 붙인다. bot은 `memory_write`로, 사용자는 메모리 창으로 같은 글을 고친다.
- 사용량 제한, 언어(한국어 기본), 테마, 글꼴은 SQLite(`meta`)에 둔다. `taskq.config.json`은 제한의 시작값만 준다.
- 모든 bot 대화 검색은 `team_messages_fts`(trigram, trigger로 유지)를 쓴다.
- 사용자가 취소한 turn은 그 메시지를 처리한 것으로 보고 다시 돌리지 않는다. 그 bot이 실행 중이던 task는 `cancelled` 상태가 된다. 작업 취소도 같은 `cancelled` 상태를 쓴다.

## 이유

- 사용자는 bot들이 마운트처럼 함께 쓰는 폴더를 원했다. 경로가 하나면 bot끼리 파일을 넘길 때 경로만 주면 되고, 사용자도 같은 폴더를 파일 관리자에서 연다.
- API에는 "쓰기 요청은 application/json만"이라는 규칙이 있고 CSRF 방어가 그 규칙에 기대고 있다. multipart를 받으려면 그 예외를 만들어야 해서, 크기가 33% 늘어나는 것을 감수하고 JSON에 담았다.
- Agent SDK의 메모리 파일은 Claude 설정에서 불러오는데, bot은 사용자 Claude 설정을 읽지 않는다. 그래서 taskq가 메모리를 관리하고, 사용자가 보고 고칠 수 있게 했다.
- 설정을 SQLite에 두면 재시작과 업그레이드(새 바이너리가 같은 파일을 연다) 뒤에도 남는다. 설정 파일을 화면에서 고치게 하지 않은 기존 결정은 그대로다.
- 검색은 자원을 적게 쓰고 한글과 영어를 함께 찾아야 했다. trigram 색인은 SQLite 안에 있어 따로 띄울 것이 없고, 한국어 조사가 붙은 단어도 부분 일치로 찾는다.
- 취소는 사용자의 의사 표시다. 다시 돌리면 사용자가 멈춘 일을 bot이 다시 한다.

## 잃는 것

- 공용 폴더는 bot 사이의 격리를 없앤다. 한 bot이 쓴 파일을 다른 bot이 고칠 수 있다.
- 다국어는 bot, 설정, 메뉴, 상태 이름에 적용했다. Calendar 도구 모음, 승인 패널, run dialog 같은 기존 화면의 문장 일부는 아직 영어다.
