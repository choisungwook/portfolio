# 기능 지도

브라우저 UI에서 사용자가 보고 조작하는 영역을 이 wiki의 이름으로 정리한다. 요청과 리뷰에서 이 이름을 그대로 쓰면 어느 패널을 말하는지 헷갈리지 않는다. 이름은 모두 `workspace/ui/index.html`과 `workspace/ui/js/`의 `data-area` 속성이다. 승인 패널처럼 동적으로 만드는 영역도 같은 이름을 쓴다.

| 이름 | data-area | API | 하는 일 |
|---|---|---|---|
| 토큰 안내 | `token-notice` | 없음 | 토큰이 없거나 서버가 401을 돌려주면 전체 너비로 보인다. `taskq run`이 출력한 URL을 열라고 안내하고, 그 뒤로 폴링과 요청을 멈춘다 |
| 헤더 검색 | `search` | `GET /api/search` | 과거 run을 FTS로 검색한다 |
| 검색 결과 | `search-results`, `search-close` | `GET /api/search` | 일치하는 run을 나열한다. 작업 제목은 행의 `task_title`을 쓴다. 항목을 누르면 run dialog가 열린다 |
| 알림 | `notice` | 모든 변경 요청 | 저장 성공과 서버 오류 메시지를 화면 오른쪽 위의 Carbon toast(색 띠, 아이콘, 글, 닫기 버튼)로 보여준다. 타이머로 사라지지 않고, 닫기 버튼을 누르거나 다음 메시지가 올 때까지 남는다. 닫으면 포커스는 알림을 일으킨 컨트롤로 돌아간다 |
| 새 작업 | `new-task-button`, `task-form`, `task-form-form`, `task-form-error` | `POST /api/tasks`, `GET /api/settings` | 작업을 추가한다. 초안 체크는 기본으로 켜져 있고, 끄면 `status: "ready"`로 보낸다. 제목, 의도, 주의 사항, lock_key, target_profile, repo, output_path, priority, depends_on(작업 id 하나) 입력을 받는다. access_skill은 등록된 접근 스킬 목록(`none` 포함)을 고르는 선택 목록이며, 설정 dialog를 닫을 때마다 다시 채운다 |
| 캘린더 탭 | `calendar`, `calendar-toolbar`, `calendar-today`, `calendar-prev`, `calendar-next`, `calendar-views`, `calendar-label`, `calendar-body` | `GET /api/runs`, `GET /api/stats/daily`, `GET /api/lock-keys` | 툴바 한 줄이다. 왼쪽은 Today, 이전·다음 화살표(`calendar-prev`, `calendar-next`), 가운데는 큰 제목(월 "November 2026", 주 "Nov 9 – 15, 2026", 일 "Sunday, November 15, 2026"), 오른쪽은 Day·Week·Month 전환이다. 탭을 누르면(이미 열린 탭이어도) 오늘로 가고 현재 시각으로 스크롤한다. Today도 같다. 주·일 보기는 요일 머리글(`day-head`)을 누르면 그 날의 일 보기로 간다. 월 보기는 6주를 `/api/runs`와 `/api/stats/daily`로 읽는다. 500개를 넘으면 "Showing first N runs" 안내를 보인다. 키보드: 이전·다음 버튼에서 좌우 화살표, 캘린더 안에서 `t`(오늘), `d`, `w`, `m`(보기 전환) |
| 캘린더 시간표 | `time-grid`, `time-head`, `day-head`, `now-line` | `GET /api/runs` | 주·일 보기. 머리글 행은 위에 고정되고 시간 영역만 세로로 스크롤한다. 시간당 48 px이며 시간선은 `--border`다. 왼쪽 시간 줄은 브라우저 로케일 형식을 따른다. 오늘 열에는 `--danger` 2 px 현재 시각선(왼쪽 끝 점)이 있고 30초마다 갱신한다. 다시 그릴 때 스크롤 위치와 포커스를 유지하며, 범위가 바뀔 때만 현재 시각(오늘이 없으면 8 AM)을 화면 높이의 3분의 1 위치로 맞춘다 |
| 캘린더 블록 | 블록 버튼(`.block`) | 없음(run 행 사용) | 블록은 시작과 끝으로 위치를 정한다. 결과 색 배경과 짙은 왼쪽 띠, 제목(굵게), 시각과 결과 낱말, 작업 종류 순으로 쓰며 높이가 허락하는 줄만 그린다. 최소 높이는 20분 분량(16 px)이고 한 줄만 들어가면 제목만 보인다. 겹치는 run은 열을 나눠 옆으로 놓고 2 px 간격을 둔다(`pure/layout-overlap.js`). 결과는 낱말로도 보인다(`title` 속성과 sr-only). 대기 구간은 "Waiting for you" 빗금이다. 포커스 링, Enter와 클릭으로 run dialog를 연다 |
| 캘린더 월 칸 | `month-cell`, `date-button`, `chip`, `more` | `GET /api/runs`, `GET /api/stats/daily` | 날짜 숫자(오늘은 강조 원)와 실패·치명 배지를 맨 윗줄에 둔다. 아래에 run 칩을 최대 3개 두고, 넘으면 "+N more"를 보인다. 날짜 숫자와 "+N more"는 그날의 일 보기를 열고, 칩은 run dialog를 연다 |
| 캘린더 필터 | `calendar-filters`, `type-filter`, `lock-key-filter`, `outcome-filter` | `GET /api/runs`, `GET /api/stats/daily`, `GET /api/lock-keys` | 두 번째 줄에 있다. Type, Account or repo, Result를 선택 목록으로 보인다. 선택지의 글은 `label()`로 만든다. Day, Week, Month 모두에 적용한다 |
| 하루 요약 | `day-summary` | `GET /api/stats/daily` | 일 보기에서 시간표 위의 한 줄 띠다. 완료, 실패, 치명 알림, 비용을 보이고, 상위 요약은 "Summary" 펼침 아래에 둔다. 펼침 상태는 갱신해도 유지된다. 범위는 "all runs" 또는 필터 이름과 값으로 밝힌다 |
| 캘린더 범례 | `calendar-legend` | 없음 | 결과마다 색 띠와 낱말(`label()`)을 나란히 보이고, 마지막에 "Waiting for you" 빗금 견본을 둔다 |
| Run dialog | `run-dialog`, `run-body` | `GET /api/runs/:id` | 요약, 결과, 시각, 통계, 출력 경로, `claude --resume` 명령 복사, 대기 구간, 이벤트 순서, 관련 알림을 보여준다 |
| 보드 탭 | `board`, `board-columns` | `GET /api/tasks`, `POST /api/tasks/:id/run` | 상태별 열. 열 제목은 상태 표시(`status-ind`)다. draft와 failed는 접혀 있다. 카드에 blocked 배지가 붙는다. 직접 실행할 수 있는 상태의 카드는 아래에 직접 실행 버튼(`run-now`)이 붙는다 |
| 작업 상세 dialog | `task-detail`, `task-body` | `GET /api/tasks/:id`, `GET /api/events?order=desc&limit=200`, `GET /api/graph`, `POST /api/tasks/:id/{run,resume,done,cancel,retry}`, `PATCH /api/tasks/:id` | 의도, 주의 사항, 상태, 승인 패널, run 목록, 최신순 이벤트 로그(최근 200개), 의존 관계, 상태 전환 버튼을 보여준다. 상태 버튼 맨 앞이 이 화면의 primary인 직접 실행 버튼(`run-now`)이다. 승인 결정은 이 dialog의 승인 패널에서만 한다. 운영 제어(`operator-controls`)는 상태 버튼 아래에 있다: running, needs_approval, needs_auth 작업에는 `cancel-task` 버튼이 있고, 첫 클릭은 Confirm cancel로 바뀌며 5초 안에 두 번째 클릭을 해야 실행된다. failed 작업에는 `retry-task` 버튼과 `retry-resume` 체크박스(Resume previous session)가 있다 |
| 승인 패널 | `approval-panel` | `POST /api/tasks/:id/{approve,deny}` (`request_id`) | `pending_approval`이 있을 때만 보인다. 아래 "승인 패널" 절을 본다 |
| 인계 기록 | `task-handoffs` | `GET /api/tasks/:id`, `POST /api/handoffs/:id/accept`, `POST /api/tasks/:id/handoff-mode` | 발신·수신 작업, 산출물 경로, 도착 시각과 수락 결과를 본다. 자동 수락을 설정하거나 대기 중인 수신 인계를 직접 수락한다 |
| 그래프 탭 | `graph`, `graph-canvas` | `GET /api/graph` | 작업을 노드, 의존을 간선으로 그린다. 의존 깊이별로 왼쪽에서 오른쪽으로 배치한다. 실패·승인·로그인 대기 상태이거나 stale run이 있고 done이 아니면 굵은 테두리를 그린다. 툴팁에 stale run 수를 보인다 |
| 제안 탭 | `proposals`, `proposal-list` | `GET /api/proposals?status=pending`, `POST /api/proposals/:id/{apply,reject}` | 대기 중인 제안의 대상 경로와 추가될 텍스트를 보여주고 적용하거나 거절한다 |
| 팀 탭 | `team` | `GET /api/team`, `GET /api/team/messages`, `GET /api/team/wiki` | 상주 agent 팀을 본다. 탭이 열려 있는 동안 5초마다 다시 읽는다. agent 메시지는 task 이벤트를 쓰지 않아 SSE로 오지 않기 때문이다. 탭이 사용자에게 온 메시지를 보여주면 읽음으로 표시한다(`POST /api/team/messages/read`) |
| 팀 상태 | `team-status` | `POST /api/team/{pause,resume}` | 팀이 꺼짐(`team.enabled` false), 멈춤(이유 표시), 동작 중 중 하나를 보인다. 꺼져 있으면 버튼이 없고, 켜져 있으면 Pause team 또는 Resume team 하나를 보인다 |
| 팀 메시지 보내기 | `team-compose`, `team-to`, `team-body` | `POST /api/team/messages` | 받는 agent(기본 lead)를 골라 사용자로서 메시지를 보낸다. 최대 8000자 |
| 팀 메시지 | `team-messages` | `GET /api/team/messages?limit=100` | 최신순 메시지. 행마다 보낸 쪽, 받는 쪽, 시각, 관련 작업, 읽지 않음 표시. 사용자가 보낸 메시지는 파란 띠, 사용자에게 온 메시지는 초록 띠 |
| 팀 agent 목록 | `team-agents` | `GET /api/team` | 이름, 역할, 설명. 턴이 진행 중이면 working과 파란 띠, 세션이 없으면 no session yet |
| 팀 wiki | `team-wiki`, `team-page` | `GET /api/team/wiki`, `GET /api/team/wiki/page?slug=` | 페이지 목록(slug, revision, 마지막 작성 agent, 제목). slug를 누르면 아래에 본문을 보인다 |
| 확인 필요 패널 | `alerts-panel`, `alert-badges`, `alerts-list` | `GET /api/alerts`, `GET /api/queue`, `POST /api/alerts/:id/ack` | 확인되지 않은 알림을 심각도 순으로 보여준다. 작업 제목은 알림 행의 `task_title`을 쓴다. critical은 위에 붉게 고정된다 |
| 승인 대기 목록 | `pending-approvals`, `pending-list` | `GET /api/approvals` | 확인 필요 패널 위에 열린 승인 요청을 모은다. 각 행은 명령 앞 120자와 Review 버튼만 가진다. Approve는 두지 않는다. 요청이 없으면 영역을 숨긴다 |
| 큐 일시정지 배너 | `queue-banner`, `queue-text`, `queue-toggle` | `GET /api/queue`, `POST /api/queue/{pause,resume}` | 배너는 항상 보인다. 큐가 도는 동안은 Queue running과 Pause queue 버튼을, 멈춘 동안은 이유와 Resume queue 버튼을 보여준다. 버튼 하나가 두 역할을 바꿔 가진다 |
| 설정 버튼 | `settings-button` | 없음 | 헤더의 톱니 아이콘이다. 누르면 설정 dialog가 열리고, 닫으면 포커스가 이 버튼으로 돌아간다. Escape로 닫는다 |
| 데스크톱 알림 설정 | `desktop-notifications` | `GET /api/settings`, `POST /api/settings/desktop-notifications` | 인계와 중요 경고의 OS 알림을 켜거나 끈다. 설정은 SQLite에 저장되고 앱 내 이력은 계속 기록된다 |
| 설정 dialog | `settings-dialog` | `GET /api/settings` | 접근 스킬 목록과 읽기 전용 구성 값을 보여준다. 두 영역으로 나뉜다 |
| 접근 스킬 목록 | `access-skills` | `GET /api/settings`, `DELETE /api/access-skills/:name` | 등록된 스킬마다 이름, 설명, 경로(고정폭)를 보인다. SKILL.md가 없으면 `missing` 표시가 붙는다. `−`를 누르면 같은 행에 `Remove` 확인 버튼이 나오고, 두 번째 클릭에서만 삭제한다. 409 메시지는 그 행에 보인다. 등록된 스킬이 없으면 설명 문구를 보인다 |
| 접근 스킬 추가 | `access-skill-add`, `access-skill-picker`, `access-skill-found`, `access-skill-path-form`, `access-skill-error` | `GET /api/skills/discover`, `POST /api/access-skills` | `+`를 누르면 열린다. 위에는 찾은 스킬 중 등록되지 않은 것을 `Add` 버튼과 함께 보이고, 아래에는 절대 경로를 입력하는 칸과 `Add` 버튼이 있다. 오류는 그 행이나 입력 칸 바로 아래에 보인다 |
| 구성 값 | `settings-config` | `GET /api/settings` | `taskq.config.json`에서 읽은 값을 읽기 전용으로 보인다. 바꾸려면 파일을 고치고 다시 시작해야 한다는 한 줄이 함께 있다. 웹에서 바꾸는 경로는 없다 |
| 작업 상세 접근 스킬 | `task-detail`의 Access skill 행 | `GET /api/settings` | 작업이 쓰는 접근 스킬의 이름과 등록된 경로를 보인다. 등록이 없어졌으면 `(not registered)`를 붙인다 |

## 확인 필요 패널의 알림별 버튼

| 알림 종류 | 버튼 |
|---|---|
| `approval_required` | Review (승인 패널로 이동한다. 승인 결정은 거기서 한다) |
| `auth_required` | Resume |
| `review_ready` | Mark done |
| 모든 알림 | Acknowledge |

## 승인 패널

사람이 승인하기 전에 실행될 입력을 그대로 보게 하는 영역이다. 작업 상세 dialog에서 `pending_approval`이 있을 때 만든다.

- 도구 이름, 입력의 바이트 수, 요청 시각을 보인다.
- Bash 도구면 `command` 문자열을 따로 `pre`에 보이고, 그 아래에 입력 전체를 JSON으로 `pre`에 보인다. 어느 것도 잘리지 않는다.
- 보이지 않는 문자는 `\u{202E}` 같은 이스케이프를 `hidden-char` 표시로 감싸 보인다. 대상은 제어 문자(줄바꿈 제외), 서식 문자(0 너비 문자, 양방향 제어 문자), 공백 문자(U+0020 외), 빈 글리프처럼 보이는 채움 문자, 사용자 영역, 할당되지 않은 코드 포인트다. 1개 이상이면 경고 줄을 보인다. 판정은 `pure/hidden-chars.js`가 한다.
- 입력이 600자를 넘거나 8줄을 넘으면 Approve가 비활성이다. 입력 `pre`를 끝까지 스크롤하거나 "I have read the whole command" 체크박스를 켜야 활성이 된다. 스크롤 위치는 같은 요청 안에서 다시 그릴 때도 유지한다. Deny는 항상 활성이다.
- Approve와 Deny는 화면에 보인 `request_id`를 보낸다. 409가 오면 작업을 다시 읽고 요청이 바뀌었다고 알린다.

## 직접 실행

`run-now` 버튼(`ui/js/core/run-now.js`)은 `POST /api/tasks/:id/run`을 보낸다. 큐가 멈춰 있거나 의존 작업이 끝나지 않았으면 서버가 거절하고, 그 이유가 알림 toast에 보인다.

| 상태 | 버튼 글 | 하는 일 |
|---|---|---|
| draft, ready | Run now | 바로 실행. 세션 유지 |
| needs_auth | Resume and run | 로그인 후 같은 세션으로 다시 실행 |
| failed, review, done | Run again | 새 세션으로 다시 실행 |
| running, needs_approval | 없음(상세에서는 비활성) | 이미 실행 중 |

## 상태 표시

작업 상태와 run 결과는 `status-ind`(`ui/js/core/status.js`)로 보인다. Carbon status indicator 규칙대로 기호, 색, 낱말을 함께 써서 색만으로 상태를 구분하지 않는다. 보드 열 제목, 작업 상세의 Status, run 목록, run dialog의 Result가 이것을 쓴다.

| 상태 | 기호 | 색 토큰 |
|---|---|---|
| draft, ready, stale | ◌, ○, ○ | `--stale` |
| running | ● | `--running` |
| review | ■ | `--review` |
| needs_approval | ▲ | `--needs-approval` |
| needs_auth | ◆ | `--needs-auth` |
| done | ✔ | `--done` |
| failed | ✖ | `--failed` |

## 실시간 갱신

서버는 같은 프로세스에서 이벤트가 기록되면 즉시 스트림으로 보내고, CLI처럼 다른 프로세스가 기록한 이벤트는 `pollSec`(기본 60초) 안에 보낸다. `/api/events/stream?token=...`을 EventSource로 구독하고, 이벤트가 올 때마다 250 ms 디바운스 후 보이는 탭을 다시 그린다. EventSource는 헤더를 보낼 수 없어서 토큰을 쿼리로 보낸다. 스트림은 현재 끝(tail)부터 시작하므로 페이지를 열 때 과거 이벤트를 다시 받지 않는다. 스트림이 끊기면 5초 폴링으로 바꾸고, 다시 연결되면 폴링을 멈춘다. 401이나 토큰 없음이면 스트림과 폴링을 모두 멈추고 토큰 안내를 보인다. 캘린더는 실행 중인 블록이 현재 시각까지 늘어나도록 30초마다 다시 그린다.

## 토큰

`taskq run`은 `http://127.0.0.1:<port>/#token=<hex>`를 출력한다. 페이지는 로드할 때 fragment에서 토큰을 읽고, `sessionStorage`에 이 탭용으로 보관한 뒤 `history.replaceState`로 주소창에서 fragment를 지운다. 모든 `/api` 요청은 `x-taskq-token` 헤더로 토큰을 보낸다. 토큰은 링크, 로그, DOM 어디에도 쓰지 않는다. 새 탭은 저장된 토큰이 없으므로 `taskq run`이 출력한 URL을 다시 열어야 한다.

## 디자인 토큰

UI는 IBM Carbon을 토큰 계약으로 따른다. 구조와 규칙은 [architecture.md](./architecture.md)의 "UI theme" 절에 있다.

- 컴포넌트 CSS가 읽을 수 있는 토큰 목록은 `workspace/ui/css/theme/contract.css`에 있고, 값은 `workspace/ui/css/theme/carbon.css`가 light(g10)와 dark(g100)로 채운다.
- 나머지 CSS 파일과 JS는 색 값을 직접 쓰지 않고 계약 토큰만 참조한다. `test/ui-tokens.test.ts`가 검사한다.
- 상태 색(`--done`, `--failed`, `--needs-approval`, `--needs-auth`, `--review`, `--running`, `--stale`)은 각각 독립된 값이고, 알림과 tag 배경은 `--error-soft`, `--warning-soft`, `--success-soft`, `--info-soft`를 쓴다.

## 로컬에서 확인하기

`workspace/`에서 데모를 띄우고 출력된 URL을 브라우저에서 연다. 주소창의 `#token=` 부분까지 포함해서 열어야 데이터가 보인다.

```bash
npm run demo
```

데모는 가짜 데이터를 넣고 큐를 멈춘 채로 뜨므로 어떤 세션도 시작되지 않는다. 내 데이터로 서버만 띄워 보려면 `wiki/development.md`의 "Never start a real session by accident" 절차를 따른다. `taskq add`는 `--draft`를 붙이지 않으면 바로 실행 대기열에 들어간다. 승인 패널을 확인하려면 승인 요청을 가진 작업이 필요하다. 이 작업은 `src/runner/approval.ts`의 `askApproval`로 만든다.
