---
type: Decision
title: Bots share one folder, keep memory and settings in SQLite, and cancel a turn without retrying it
description: The shared folder is mounted into every bot session; uploads stay JSON; memory, limits, language and theme live in SQLite; a cancelled turn's work is not replayed.
tags: [bots, storage, ui]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-19T15:30:00Z }
---

## 결정

- `TASKQ_HOME/shared`를 모든 bot 세션의 `additionalDirectories`로 넘긴다. 첨부파일은 `shared/attachments/<날짜>/<id>-<이름>`에 저장하고, 메시지와 task에는 이 폴더 기준 경로만 남긴다. task 실행은 유형과 관계없이 이 폴더를 읽을 수 있지만 쓸 수는 없다.
- bot이 작업하는 기본 폴더(세션 cwd)는 `shared/bots/<bot>/`이다(0.15.0부터, 이전은 `TASKQ_HOME/team/<bot>`). bot 설정의 작업 디렉터리를 정하면 그쪽을 쓴다. 메모리, OpenAI 기록, Kiro 설정은 `team/<bot>/`에 남는다. 사용자가 공용 폴더 화면에서 bot마다 무엇을 했는지 보게 하려는 것이고, 설정 파일까지 옮기면 bot이 자기 설정을 고칠 수 있게 되므로 작업 폴더만 옮겼다.
- 업로드는 base64를 담은 JSON(`POST /api/files`, 20 MB)이다. multipart를 받지 않는다.
- bot 메모리는 `team_agents.memory`에 두고 매 turn system prompt 끝에 붙인다. bot은 `memory_write`로, 사용자는 메모리 창으로 같은 글을 고친다.
- 사용량 제한, 언어(한국어 기본), 테마, 글꼴은 SQLite(`meta`)에 둔다. `taskq.config.json`은 제한의 시작값만 준다.
- 모든 bot 대화 검색은 `team_messages_fts`(trigram, trigger로 유지)를 쓴다.
- bot이 사용자나 다른 bot을 위해 만든 파일은 `shared/outputs/<bot>/`에 저장하고 `send_message`의 `files`로 넘긴다. 공용 폴더 밖의 경로는 거부한다. 메시지에는 첨부파일과 같은 형식(공용 폴더 기준 경로)으로 남는다.
- 파일 미리 보기에서 HTML은 `POST /api/shared/preview`가 발급한 10분짜리 ticket URL(`/preview/<ticket>/<이름>`)로 연다. 응답은 `sandbox allow-scripts` CSP를 달고, ticket은 그 파일이 있는 폴더 안의 파일만 내준다. Markdown은 파싱한 구조를 textContent로만 그린다.
- 사용자가 취소한 turn은 그 메시지를 처리한 것으로 보고 다시 돌리지 않는다. 그 bot이 실행 중이던 task는 `cancelled` 상태가 된다. 작업 취소도 같은 `cancelled` 상태를 쓴다.

## 이유

- 사용자는 bot들이 마운트처럼 함께 쓰는 폴더를 원했다. 경로가 하나면 bot끼리 파일을 넘길 때 경로만 주면 되고, 사용자도 같은 폴더를 파일 관리자에서 연다.
- API에는 "쓰기 요청은 application/json만"이라는 규칙이 있고 CSRF 방어가 그 규칙에 기대고 있다. multipart를 받으려면 그 예외를 만들어야 해서, 크기가 33% 늘어나는 것을 감수하고 JSON에 담았다.
- Agent SDK의 메모리 파일은 Claude 설정에서 불러오는데, bot은 사용자 Claude 설정을 읽지 않는다. 그래서 taskq가 메모리를 관리하고, 사용자가 보고 고칠 수 있게 했다.
- 설정을 SQLite에 두면 재시작과 업그레이드(새 바이너리가 같은 파일을 연다) 뒤에도 남는다. 설정 파일을 화면에서 고치게 하지 않은 기존 결정은 그대로다.
- 검색은 자원을 적게 쓰고 한글과 영어를 함께 찾아야 했다. trigram 색인은 SQLite 안에 있어 따로 띄울 것이 없고, 한국어 조사가 붙은 단어도 부분 일치로 찾는다.
- bot이 결과물을 각자 작업 폴더에 두면 사용자가 찾을 수 없다. 공용 폴더의 bot별 폴더로 정하면 사용자가 대화에서 바로 열고, 공용 폴더 화면에서도 같은 위치에서 찾는다.
- 처음에는 HTML을 `srcdoc` iframe으로 띄웠다. srcdoc 문서는 앱 페이지의 CSP(`default-src 'self'`)를 물려받아 bot이 만든 HTML의 인라인 스타일과 스크립트가 차단됐다. 앱 CSP를 풀지 않고 미리 보기 응답에만 별도 CSP를 주려고 별도 경로를 만들었다. iframe은 토큰 헤더를 보낼 수 없어 API 토큰 대신 짧은 ticket을 URL에 담는다.
- 취소는 사용자의 의사 표시다. 다시 돌리면 사용자가 멈춘 일을 bot이 다시 한다.

## 잃는 것

- 공용 폴더는 bot 사이의 격리를 없앤다. 한 bot이 쓴 파일을 다른 bot이 고칠 수 있다.
- 미리 보기 HTML은 https 외부 리소스(CDN 스크립트, 글꼴)를 불러올 수 있다. 브라우저로 직접 여는 것과 같은 수준이며, sandbox로 taskq 토큰과 API에는 닿지 않는다.
- 다국어는 bot, 설정, 메뉴, 상태 이름에 적용했다. Calendar 도구 모음, 승인 패널, run dialog 같은 기존 화면의 문장 일부는 아직 영어다.
