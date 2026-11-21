# 기능 지도

브라우저 UI에서 사용자가 보고 조작하는 영역을 이 wiki의 이름으로 정리한다. 요청과 리뷰에서 이 이름을 그대로 쓰면 어느 패널을 말하는지 헷갈리지 않는다. 이름은 모두 `workspace/ui/index.html`과 `workspace/ui/js/`의 `data-area` 속성이다. 승인 패널처럼 동적으로 만드는 영역도 같은 이름을 쓴다.

| 이름 | data-area | API | 하는 일 |
|---|---|---|---|
| 데스크톱 시작 화면 | `#status`, `#error` (`workspace/desktop/src/index.html`) | 없음 | macOS 데스크톱 앱만. 앱을 열고 taskq가 주소를 출력할 때까지 "Starting taskq…"를 보이고, 주소가 나오면 창이 taskq 화면으로 넘어간다. taskq가 주소 없이 끝나면 "taskq did not start."와 마지막 출력 20줄을 보인다 |
| 확인 dialog | `.ask-dialog` (`ui/js/core/ask.js`) | 없음 | 삭제 확인(workflow, worktree, MCP server), workflow 편집을 버릴지, workflow 승인·거절 메모를 묻는 작은 창. 취소·확인 버튼, Esc는 취소 |
| 토큰 안내 | `token-notice` | 없음 | 토큰이 없거나 서버가 401을 돌려주면 전체 너비로 보인다. `taskq run`이 출력한 URL을 열라고 안내하고, 그 뒤로 폴링과 요청을 멈춘다 |
| 검색 dialog | `search-dialog`, `msg-query`, `search-tabs`, `msg-hits`, `.sd-item` | `GET /api/bots/search`, `GET /api/search`, `GET /api/bots` | 화면 위에 뜨는 검색 창이다. 입력, 전체·작업·Bots 탭(Bots는 bot 이름과 그 대화 내용을 함께 찾는다), 결과 절. 입력 전에는 주의 필요(읽지 않은 bot, needs_approval·needs_auth 작업), 최근 항목(마지막 메시지 순 bot), 작업 메뉴(새 작업, bot 추가). 입력하면 bot 이름·설명, 열린 작업 제목, 대화(trigram FTS, 누르면 그 메시지로 이동), 지난 실행(누르면 run dialog)을 보인다. 위아래 화살표, Enter, Esc, 바깥 클릭으로 닫기 |
| 알림 | `notice` | 모든 변경 요청 | 저장 성공과 서버 오류 메시지를 화면 오른쪽 위의 Carbon toast(색 띠, 아이콘, 글, 닫기 버튼)로 보여준다. 타이머로 사라지지 않고, 닫기 버튼을 누르거나 다음 메시지가 올 때까지 남는다. 닫으면 포커스는 알림을 일으킨 컨트롤로 돌아간다 |
| 새 작업 | `new-task-button`, `task-form`, `task-form-form`, `task-form-error`, `task-intent`, `task-attach-zone`, `task-attachments`, `task-repo`, `task-worktree-field` | `POST /api/tasks`, `GET /api/repos`, `GET /api/paths/check`, `GET /api/bots`, `GET /api/workflows` | 사이드바의 새 작업. 맨 위 제목, 의도, 첨부(끌어다 놓기·붙여넣기·`+`), 저장소나 폴더(선택, git이면 브랜치와 "새 git worktree에서 작업"), Bot, Workflow, 초안(기본 켜짐)만 받는다. 종류 선택은 없다: 폴더가 있으면 `code`, 없으면 `research`로 보낸다. 추가하면 창이 닫히고 작업 상세는 열리지 않는다 |
| 사이드바 | `sidebar`, `side-hero`, `side-views`, `side-shared` | 없음 | 왼쪽 메뉴다. 맨 위 가운데에 오케스트레이터 taskq가 큰 검은 아바타와 이름으로 있고(`side-hero`, 누르면 그 대화, 오른쪽 버튼은 bot 메뉴), 그 아래 새 작업(`new-task-button`)과 검색(`search-open`, Cmd/Ctrl+K), 그 아래 Calendar, task 상태보드(Task status board), 공용 폴더, Workflows, Plugins, Wiki, 맨 아래 Bots 목록이 있다. 앱 이름은 브라우저 탭 제목에만 있다. 맨 아래 오른쪽에 확인 필요(종)와 설정 아이콘이 있다. 제안, 목표, 토론, 그래프 메뉴는 없다(작업 의존 관계는 작업 상세에 남는다). 글은 설정의 언어를 따른다(기본 한국어). 선택한 항목은 `aria-current="page"`와 굵은 글씨로 보인다. 마지막으로 연 화면은 브라우저 저장소에 남아 다시 열 때 복원된다. 800 px 아래에서는 메뉴가 위로 가고 화면 항목은 가로로 넘긴다 |
| Bots 목록 | `bot-list`, `bots-state`, `.side-bot[data-bot]`, `.side-bot-gear` | `GET /api/bots`, `POST /api/bots/{pause,resume}` | 오케스트레이터 taskq는 목록이 아니라 사이드바 위의 `side-hero`에 있다. 채팅 목록처럼 bot마다 원형 아바타(이름 첫 글자), 이름, 가장 최근 메시지(누구에게 또는 누구에게서), 시각(오늘은 시각, 어제는 Yesterday, 그 전은 날짜), 사용자에게 보낸 읽지 않은 메시지가 있으면 파란 점을 보인다. 일하는 중이면 아바타 둘레에 강조색 고리가 돌고, 미리보기 자리에 "작업 중 12s"가 1초마다 바뀐다. 아바타 오른쪽 아래에 실행 SDK 표시(✻ Claude)가 있다. 머리글 오른쪽은 Off(설정에서 꺼짐), 멈췄으면 Paused(이유는 툴팁)와 Resume all, 그 밖에는 Pause all 버튼만 있다. 정상 동작 상태는 따로 표시하지 않는다. 5초마다 다시 읽는다. bot 메시지는 task 이벤트를 쓰지 않아 SSE로 오지 않기 때문이다. 행에 마우스를 올리면 톱니(`side-bot-gear`)가 보이고 누르면 bot 설정이 열린다 이름 줄 오른쪽 작은 원은 그 bot의 context가 찬 정도다. SDK 표시는 Claude ✻, OpenAI ◎, Kiro K. 이름 옆 점은 그 bot의 연결 상태다(초록 연결됨, 빨강 실패, 마우스를 올리면 연결 이름과 실패 이유; `GET /api/connections`를 1분마다 읽음). 설정 톱니는 항상 보인다 |
| Bot 헌장·먼저 묻기 | `charter_owns`, `charter_good`, `charter_never`, `ask_first` | `PUT /api/bots/:name` | bot 설정(편집할 때). 헌장 3칸(맡는 일, 좋은 결과, 묻지 않고 하지 말 것)은 지시문에 붙는다. "먼저 묻기"는 줄마다 패턴 하나이고 걸린 명령은 승인을 기다린다 |
| Bot 추가 | `bot-add`, `bot-sdk`, `bot-provider` | `POST /api/bots`, `GET /api/connection-settings` | Bots 머리글의 `+`. 제목 아래로 이름, Agent type(Claude, OpenAI, Kiro), 인증 방식(SDK, 구독, AWS Bedrock; Kiro는 AWS IAM Identity Center 하나), 설명을 한 줄씩 받는다. Claude의 인증 방식은 설정 > 연결에서 고른 방식이 처음 값이다. 역할, 지시문, 권한은 기본값으로 시작하고 만든 뒤 bot의 설정에서 바꾼다. skill, plugin, MCP server는 Plugins 메뉴의 것을 타입에 맞게 모두 쓴다. 모델은 대화 입력창 아래 메뉴에서 고른다. 만들면 그 bot의 대화가 열린다 |
| Bot 메뉴 | `bot-menu` | `POST /api/bots/:name/{reload,reset}`, `PUT /api/bots/:name`, `DELETE /api/bots/:name` | bot에서 오른쪽 버튼(또는 컨텍스트 메뉴 키, Shift+F10). (일하는 중이면 맨 위에 진행 중 작업 취소), 대화 열기, 설정…, 메모리…, skill 다시 불러오기, plugin 다시 불러오기, 새 세션 시작, 세션 폴더 열기, 끄기/켜기, 삭제…. Delete는 같은 자리에서 한 번 더 눌러야 실행된다. taskq에는 Disable과 Delete가 없다. Reload 결과는 toast와 대화의 읽음 처리된 메모로 남는다. 위아래 화살표로 이동하고 Escape로 닫는다 |
| Bot 메모리 | `memory-dialog`, `memory-text`, `memory-count` | `GET /api/bots/:name/memory`, `PUT /api/bots/:name/memory` | bot이 매 turn 읽는 자기 메모. 글자 수(최대 16,000)를 보이고 저장한다 |
| Bot 설정 | `bot-settings`, `bot-form`, `bot-mode`, `bot-delete`, `bot-session-folder` | `GET /api/bots/:name`, `PUT /api/bots/:name`, `GET /api/connection-settings` | 제목(H1)은 `<이름> settings`. Agent type과 인증 방식(위 Bot 추가와 같은 선택지), 그 조합의 준비와 권한 모드 안내, 역할, 설명(다른 bot이 일을 넘길 때 읽는 글), 지시, 작업 디렉터리, 헌장, 권한 모드(기본 Auto), 샌드박스와 허용 호스트, 차단 명령(줄마다 하나, `*`만 와일드카드), 세션 폴더 열기, 사용 여부, 나에게 직접 메시지 허용. skill·plugin·MCP 고르기와 routine은 없다. 오류는 dialog 안에 보인다. Claude가 아니면 auto 모드가 없다 |
| 대화 안 오류 | `.msg[data-side="error"]` | `GET /api/bots/:name/turn-errors`, `GET /api/bots/:name/connection` | bot 대화 안에 시간 순으로 보인다. 실패한 turn은 "turn 실패: <이유>", 서버가 거부한 내 메시지는 "보내지 못함: <오류>"(입력은 그대로 남아 다시 보낼 수 있음), 내 마지막 메시지에 아직 대답이 없고 bot이 지금 대답할 수 없으면 맨 아래에 "아직 대답할 수 없음: <연결 패널의 이유>" |
| bot의 승인 요청 | Must check의 `approval_required` 알림 | `POST /api/bot-approvals/:id` | 되돌릴 수 없는 명령이나 "먼저 묻기" 규칙에 걸린 bot의 호출은 Must check에 승인 필요로 뜨고 "한 번 승인"과 "거부"로 답한다 |
| Bot 채팅 | `bot-chat`, `bot-head`, `bot-log`, `bot-compose`, `bot-input`, `bot-attach`, `bot-attachments`, `chat-working`, `chat-find`, `.chat-gear` | `GET /api/bots/messages?agent=`, `POST /api/bots/messages`, `POST /api/bots/messages/read` | Bots 목록에서 bot을 누르면 열린다. 머리글은 아바타, 이름, 역할, 권한 모드·샌드박스·차단 명령 수, 일하는 중 여부, 설명, 설정 톱니, 그 bot이 owner인 끝나지 않은 작업 칩(누르면 작업 상세). 대화는 오래된 순이고, 머리글·메시지·작업 바·입력창이 가운데 한 열(최대 820px, `.chat`의 `--column`)에 놓인다. bot이 보낸 말은 왼쪽, 사용자가 보낸 말은 오른쪽 강조색 말풍선, 다른 bot과 taskq가 보낸 말은 왼쪽 테두리 말풍선에 보낸 이름을 붙인다. 말풍선 아래에 시각, 받는 쪽(다른 bot에게 보낸 경우), 토론 번호, 예약 시각, 작업 링크를 둔다. Enter로 보내고 Shift+Enter로 줄을 바꾸며, 한글 조합 중 Enter는 보내지 않는다. 입력창은 내용에 맞춰 240 px까지 늘어난다. bot이 일하는 중에 보낸 메시지는 기다리지 않고 진행 중인 turn에 들어가고(Claude bot), 들어가지 못한 메시지 수는 작업 바에 "N 대기"로, 쉬는데 대기 중이면 "빈 turn 자리를 기다립니다"로 보인다. bot이 일하는 동안 입력창 위에 작업 바(`chat-working`: 깜박이는 점, "작업 중… 12s", 실행 중인 task, "esc로 중단", 중단 버튼)가 보이고, 입력창에서 Esc나 중단 버튼으로 turn을 취소한다. 쉬는 중에는 Esc 두 번이 입력을 지운다. 취소된 turn은 대화에 "취소됨"으로 남는다. `+` 버튼, 끌어다 놓기(대화 전체가 놓을 곳), 붙여넣기(스크린샷 포함)로 파일을 첨부하면 입력창 위에 칩으로 보이고, 메시지의 파일 카드(`.file-card`: 아이콘, 이름, 폴더. 사용자가 첨부한 파일, bot이 `send_message`의 `files`로 넘긴 결과물)를 누르면 오른쪽 창(`bot-file`)에 보인다. 머리글의 파일 아이콘(`[data-pane="files"]`)은 이 대화의 모든 파일 카드를, 브라우저 아이콘(`[data-pane="browser"]`)은 그 bot이 조종하는 브라우저(`.browser-screen`)를 같은 오른쪽 창에 연다. bot의 headless Chrome 화면을 1초마다 다시 그리고, 주소창에서 연 페이지와 그림을 누른 자리는 같은 브라우저에서 열리고 눌린다. 아직 브라우저가 없으면 안내만 보이고, 보기만으로는 브라우저를 켜지 않는다(다시 누르면 닫힘, Esc로도 닫힘, 새 탭은 사용자 브라우저에서 연다). 입력창은 둥근 상자 하나다. `+`(`bot-attach`)는 메뉴(`bot-attach-menu`: 파일 또는 사진 추가 Cmd/Ctrl+U, 폴더 추가, 슬래시 명령어, 플러그인)를 열고, 일하는 동안 중지 버튼(`bot-stop`)이 보내기 옆에 보인다. 모델, effort, 권한, context 원은 입력창 아래 오른쪽(`bot-tools`)에 있다. 입력 중 `@`를 치면 같은 목록(`bot-slash`)에 다른 bot과 공용 폴더 파일(최대 40개 폴더·400개 파일, 30초 캐시)이 나온다. bot을 고르면 `@이름`이 들어가고 보낼 때 그 bot에게도 같은 메시지와 파일이 간다(알림 "함께 보냄"). 파일을 고르면 `@경로`가 들어가고 그 파일이 첨부된다. Cmd/Ctrl+F는 대화 안 찾기(`chat-find`: 강조, n/m, 위·아래, Esc로 닫기)를 연다. 화면이 bot이 사용자에게 보낸 메시지를 보여주면 읽음으로 표시한다. 열려 있는 동안 5초마다 다시 읽는다 |
| 작업 과정 | `.steps`, `.step-list`, `.step-spinner` | `GET /api/bots/:name/steps` | bot 대화 안에서 메시지 사이에 bot이 부른 도구를 시간 순으로 접어 보인다. 이어진 호출 하나는 "실행함 Bash git fetch…", 여럿은 "실행됨 도구 N개" 한 줄이고, 누르면 도구와 명령·파일·패턴 목록이 펼쳐진다(다시 그려도 펼친 상태 유지). bot이 아직 그 묶음에서 일하는 중이면 줄 맨 앞에서 점 네 개가 돌고, 지금 부르는 도구와 그 호출 뒤로 지난 초가 1초마다 바뀐다. `send_message`는 메시지로 이미 보이므로 빠진다. Kiro bot은 기록이 없고, OpenAI bot은 붙인 MCP server의 도구 호출이 남지 않는다(SDK runner가 직접 부름) |
| 대화 오른쪽 | `bot-side`, `.side-row` | `GET /api/bots/:name/activity` | 1200px보다 넓은 창에서 bot 대화 오른쪽 300px 열. 변경 사항은 그 bot의 대화와 작업 요약에 나온 PR 중 아직 열린 것(제목, #번호, 누르면 GitHub)이고, 백그라운드 작업은 그 bot이 보낸 메시지로 일하는 다른 bot(하위 세션, 누르면 그 대화), 그 bot의 끝나지 않은 작업(누르면 작업 상세), 지난 24시간에 끝난 작업 수("종료됨 N개")다. 보일 것이 없거나 파일 창이 열리면 숨는다. 15초마다 다시 읽고, 대화·파일 창·이 열은 각자 스크롤한다 |
| 대화 머리글 버튼 | `.chat-tools .chat-gear[data-tip]` | 없음 | 파일(폴더 아이콘, ⇧⌘F), 브라우저(⇧⌘B), bot 설정(⇧⌘,) 원형 버튼. 마우스를 올리거나 키보드로 고르면 버튼 아래에 검은 말풍선으로 이름과 단축키가 보인다. Mac이 아니면 Shift+Ctrl. 다른 dialog가 열려 있으면 단축키는 동작하지 않는다 |
| 창 버튼 | `.window-controls`, `.wc-close`, `.wc-min`, `.window-dock`, `.window-chip` | 없음 | 설정, bot 설정, 메모리, 작업 상세, 새 작업, 실행 dialog의 왼쪽 위에 macOS처럼 닫기(빨강)와 내리기(노랑)만 있고 확대는 없다. 마우스를 올리면 ×, −가 보인다. 내리면 dialog가 입력을 그대로 둔 채 닫히고 화면 왼쪽 아래에 그 제목의 칩이 남으며, 칩을 누르면 다시 열린다 |
| 공용 폴더 | `shared-view`, `shared-crumbs`, `shared-views`, `shared-sort`, `shared-dir`, `shared-upload`, `shared-open`, `shared-drop`, `shared-list`, `shared-file` | `GET /api/shared`, `GET /api/shared/file`, `POST /api/files`, `POST /api/open-folder`, `POST /api/open-file` | 모든 bot이 같은 경로로 쓰는 폴더. 경로 표시(누르면 상위로). 파일 관리자처럼 보기를 목록(이름만, 여러 열), 자세히(이름·종류·크기·수정한 날짜 표, 머리글을 누르면 그 열로 정렬), 아이콘(타일) 중에서 고르고, 이름·종류·크기·수정한 날짜로 오름차순이나 내림차순 정렬한다(폴더가 항상 먼저). 보기와 정렬은 브라우저 저장소에 남는다. 폴더를 누르면 들어가고, 파일을 누르면 오른쪽 파일 창(`shared-file`)에 보인다. 끌어다 놓거나 붙여넣거나 올리기 버튼으로 올린 파일은 `attachments/<날짜>/`에 저장된다. 파일 관리자에서 열기 버튼 |
| 파일 창 | `bot-file`, `shared-file`, `.file-head`, `.file-body` | `GET /api/shared/file`, `POST /api/shared/preview`, `GET /preview/<ticket>/*`, `POST /api/open-file` | 공용 폴더의 파일 하나를 대화나 공용 폴더 옆에 보인다. HTML은 `POST /api/shared/preview`가 준 10분짜리 `/preview/<ticket>/` 주소를 `sandbox="allow-scripts"` iframe으로 연다(응답도 sandbox CSP, 인라인 스타일·스크립트와 같은 폴더의 이미지·CSS는 동작, taskq 토큰과 API에는 닿지 않음), Markdown은 렌더링(링크는 http·https·mailto만), 이미지와 텍스트는 그대로, 5 MB 넘는 파일(HTML 제외)과 그 밖의 종류(pptx, docx, 압축 파일 등)는 미리 보지 않는다. 열기(이 컴퓨터의 연결된 앱. 문서·이미지 같은 종류만, 실행 비트가 있거나 스크립트인 파일은 서버가 거부하고 코드 파일에는 버튼이 없다), 공용 폴더에서 보기(그 폴더로 가서 파일 선택), 내려받기, 닫기 버튼. 1100 px 아래에서는 목록 아래로 내려간다 |
| Wiki | `wiki`, `wiki-search`, `wiki-query`, `wiki-list`, `wiki-page` | `GET /api/bots/wiki?q=`, `GET /api/bots/wiki/page?slug=` | 검색어가 없으면 페이지 목록(제목, slug, revision, 마지막 작성 bot), 있으면 bot이 쓰는 것과 같은 검색 결과(제목, slug, 링크로 찾은 경우 linked from, 일치 부분). 항목을 누르면 오른쪽에 본문을 보인다 |
| 캘린더 | `calendar`, `calendar-toolbar`, `calendar-today`, `calendar-prev`, `calendar-next`, `calendar-views`, `calendar-label`, `calendar-body` | `GET /api/runs`, `GET /api/stats/daily`, `GET /api/lock-keys` | 툴바 한 줄이다. 왼쪽은 Today, 이전·다음 화살표(`calendar-prev`, `calendar-next`), 가운데는 큰 제목(월 "November 2026", 주 "Nov 9 – 15, 2026", 일 "Sunday, November 15, 2026"), 오른쪽은 Day·Week·Month 전환이다. 메뉴에서 누르면(이미 열려 있어도) 오늘로 가고 현재 시각으로 스크롤한다. Today도 같다. 주·일 보기는 요일 머리글(`day-head`)을 누르면 그 날의 일 보기로 간다. 월 보기는 6주를 `/api/runs`와 `/api/stats/daily`로 읽는다. 500개를 넘으면 "Showing first N runs" 안내를 보인다. 키보드: 이전·다음 버튼에서 좌우 화살표, 캘린더 안에서 `t`(오늘), `d`, `w`, `m`(보기 전환) |
| 캘린더 시간표 | `time-grid`, `time-head`, `day-head`, `now-line` | `GET /api/runs` | 주·일 보기. 머리글 행은 위에 고정되고 시간 영역만 세로로 스크롤한다. 시간당 48 px이며 시간선은 `--border`다. 왼쪽 시간 줄은 브라우저 로케일 형식을 따른다. 오늘 열에는 `--danger` 2 px 현재 시각선(왼쪽 끝 점)이 있고 30초마다 갱신한다. 다시 그릴 때 스크롤 위치와 포커스를 유지하며, 범위가 바뀔 때만 현재 시각(오늘이 없으면 8 AM)을 화면 높이의 3분의 1 위치로 맞춘다 |
| 캘린더 블록 | 블록 버튼(`.block`) | 없음(run 행 사용) | 블록은 시작과 끝으로 위치를 정한다. 결과 색 배경과 짙은 왼쪽 띠, 제목(굵게), 시각과 결과 낱말, 작업 종류 순으로 쓰며 높이가 허락하는 줄만 그린다. 최소 높이는 20분 분량(16 px)이고 한 줄만 들어가면 제목만 보인다. 겹치는 run은 열을 나눠 옆으로 놓고 2 px 간격을 둔다(`pure/layout-overlap.js`). 결과는 낱말로도 보인다(`title` 속성과 sr-only). 대기 구간은 "Waiting for you" 빗금이다. 포커스 링, Enter와 클릭으로 run dialog를 연다 |
| 캘린더 월 칸 | `month-cell`, `date-button`, `chip`, `more` | `GET /api/runs`, `GET /api/stats/daily` | 날짜 숫자(오늘은 강조 원)와 실패·치명 배지를 맨 윗줄에 둔다. 아래에 run 칩을 최대 3개 두고, 넘으면 "+N more"를 보인다. 날짜 숫자와 "+N more"는 그날의 일 보기를 열고, 칩은 run dialog를 연다 |
| 캘린더 필터 | `calendar-filters`, `type-filter`, `lock-key-filter`, `outcome-filter` | `GET /api/runs`, `GET /api/stats/daily`, `GET /api/lock-keys` | 두 번째 줄에 있다. Type, Account or repo, Result를 선택 목록으로 보인다. 선택지의 글은 `label()`로 만든다. Day, Week, Month 모두에 적용한다 |
| 하루 요약 | `day-summary` | `GET /api/stats/daily` | 일 보기에서 시간표 위의 한 줄 띠다. 완료, 실패, 치명 알림, 비용을 보이고, 상위 요약은 "Summary" 펼침 아래에 둔다. 펼침 상태는 갱신해도 유지된다. 범위는 "all runs" 또는 필터 이름과 값으로 밝힌다 |
| 캘린더 범례 | `calendar-legend` | 없음 | 결과마다 색 띠와 낱말(`label()`)을 나란히 보이고, 마지막에 "Waiting for you" 빗금 견본을 둔다 |
| Run dialog | `run-dialog`, `run-body` | `GET /api/runs/:id` | 요약, 결과, 시각, 통계, 출력 경로, `claude --resume` 명령 복사, 대기 구간, 이벤트 순서, 관련 알림을 보여준다 |
| task 상태보드 | `board`, `board-columns`, `.board-row`, `.board-arrow` | `GET /api/tasks`, `POST /api/tasks/:id/run` | 상태별 열을 task가 지나가는 순서로 두 줄에 놓는다. 첫 줄은 초안 → 대기 → 실행 중 → 승인 대기, 둘째 줄은 → 로그인 필요 → 확인 대기 → 완료이고, 그 뒤에 흐름 밖인 실패와 취소가 접혀 있다. 열 사이 화살표(`board-arrow`)가 순서를 보인다. 카드는 회색 열 위의 흰 타일(직접 실행 버튼까지 한 덩어리, 옅은 그림자)이라 서로 구별된다. 열 제목은 상태 표시(`status-ind`)다. 카드에 blocked 배지가 붙는다. 직접 실행할 수 있는 상태의 카드는 아래에 직접 실행 버튼(`run-now`)이 붙는다 |
| 작업 상세 dialog | `task-detail`, `task-body` | `GET /api/tasks/:id`, `POST /api/tasks/:id/{run,resume,done,cancel,retry}`, `PATCH /api/tasks/:id` | 필요한 것만 보인다: 제목, 상태·Owner·Workflow·수정 시각, 상태 버튼(맨 앞이 직접 실행 `run-now`), 운영 제어(`operator-controls`: 취소는 두 번 클릭, 실패 작업은 재시도), 승인 패널, 의도, 첨부 파일, run 목록, 알림(있을 때). 이벤트 로그, 의존 관계, 넘김(handoff), 주의 사항은 화면에서 뺐고 API와 CLI에 남는다. done 작업에는 "Save as workflow"가 있다 |
| 승인 패널 | `approval-panel` | `POST /api/tasks/:id/{approve,deny}` (`request_id`) | `pending_approval`이 있을 때만 보인다. 아래 "승인 패널" 절을 본다 |
| 인계 기록 | `task-handoffs` | `GET /api/tasks/:id`, `POST /api/handoffs/:id/accept`, `POST /api/tasks/:id/handoff-mode` | 발신·수신 작업, 산출물 경로, 도착 시각과 수락 결과를 본다. 자동 수락을 설정하거나 대기 중인 수신 인계를 직접 수락한다 |
| 확인 필요 패널 | `alerts-button`, `alerts-count`, `alerts-panel`, `alert-badges`, `alerts-list` | `GET /api/alerts`, `GET /api/queue`, `POST /api/alerts/:id/ack` | 사이드바 맨 아래 오른쪽(`side-foot`, 설정 왼쪽)의 종 아이콘. 패널은 종 오른쪽에 아래를 맞춰 열린다. 확인되지 않은 알림을 심각도 순으로 보여준다. 작업 제목은 알림 행의 `task_title`을 쓴다. critical은 위에 붉게 고정된다. 숫자는 열린 critical·high 알림 수와, 자기 알림이 없는 승인 대기 수의 합이고(task 승인은 알림이 함께 뜨므로 한 번만 센다), 누르면 아이콘 아래에 패널이 페이지 위로 열리며 Escape나 바깥 클릭으로 닫힌다. normal 알림은 보이지 않는다 |
| 승인 대기 목록 | `pending-approvals`, `pending-list` | `GET /api/approvals` | 확인 필요 패널 위에 열린 승인 요청을 모은다. 각 행은 명령 앞 120자와 Review 버튼만 가진다. Approve는 두지 않는다. 요청이 없으면 영역을 숨긴다 |
| 큐 일시정지 배너 | `queue-banner`, `queue-text`, `queue-toggle` | `GET /api/queue`, `POST /api/queue/{pause,resume}` | 배너는 확인 필요 패널 맨 위에 있다. 패널이 닫혀 있을 때 큐가 멈추면 종 아이콘에 "!"가 뜬다(다른 알림이 없을 때). 큐가 도는 동안은 Queue running과 Pause queue 버튼을, 멈춘 동안은 이유와 Resume queue 버튼을 보여준다. 버튼 하나가 두 역할을 바꿔 가진다 |
| 설정 버튼 | `settings-button` | 없음 | 사이드바 맨 아래 오른쪽, 종 아이콘 오른쪽의 톱니 아이콘이다. 상단 바는 없다. 누르면 설정 dialog가 열리고, 닫으면 포커스가 이 버튼으로 돌아간다. Escape로 닫는다 |
| 데스크톱 알림 설정 | `desktop-notifications` | `GET /api/settings`, `POST /api/settings/desktop-notifications` | 인계와 중요 경고의 OS 알림을 켜거나 끈다. 설정은 SQLite에 저장되고 앱 내 이력은 계속 기록된다 |
| 입력창 도구 | `bot-tools`, `bot-slash` | `GET /api/bots/:name/catalog`, `PUT /api/bots/:name`, `POST /api/bots/:name/reload` | 입력창 아래 줄. 왼쪽 새로고침 아이콘은 skill·plugin을 다시 읽고 모델·명령 목록을 새로 불러온다. 오른쪽에 모델, effort, 권한 메뉴가 있고 바꾸면 bot에 저장되어 다음 turn부터 적용된다. SDK가 목록을 주지 못하면 "내장 목록"이 표시된다. OpenAI bot의 권한 메뉴에는 auto가 없다. 입력창에 `/`를 치면 명령 목록(`bot-slash`)이 뜨고 ↑↓, Enter·Tab으로 고르며 Esc로 닫는다 새로고침 옆의 원은 마지막 turn 뒤 context가 찬 정도(%)다. 60%와 85%에서 색이 바뀌고, 아직 모르면 점선이다 모델 메뉴에는 실제 모델만 있고(기본 모델과 SDK의 `default` 별칭 없음, 모델이 없는 bot은 첫 모델이 보임), 모델을 고르면 대화 전체가 새 모델로 다시 전송되어 비용이 는다는 확인 창(먼저 /compact 권장)이 뜬다. 확인하면 저장되고 대화에 "Model changed: A → B"와 skill·plugin 다시 불러오기 메모가 남는다. 슬래시·@ 목록은 입력창과 같은 너비다 |
| Workflows | `workflows-view`, `.wf-card`, `.wf-studio`, `.wf-palette`, `.wfc`, `.wf-inspector`, `.wf-runs` | `GET/POST/PUT/DELETE /api/workflows`, `POST /api/workflows/:id/run`, `GET /api/workflow-runs`, `GET /api/workflow-runs/:id`, `POST /api/workflow-runs/:id/cancel`, `POST /api/workflow-runs/:id/steps/:step/approve` | 위 탭으로 워크플로와 실행 기록을 오간다. 목록 카드는 이름, 설명, 단계 줄, 마지막 실행 상태, 실행 수, bot으로 실행, 편집, 삭제(확인 창). 편집기는 n8n처럼 위에 단계 팔레트(실행, 검증, 넘김, 승인), 가운데 캔버스, 오른쪽 단계 속성 패널이다. 캔버스에서 노드를 끌어 옮기고, 노드 오른쪽 점에서 다른 노드로 끌어 연결하고, 연결이나 노드를 골라 Delete로 지운다. 빈 곳을 끌어 이동, Ctrl/Cmd+휠이나 버튼으로 확대, 화면 맞춤, 자동 정렬이 있다. 순환이 생기는 연결은 거부하고 알린다. 노드 위치는 저장된다. 편집기 머리글에도 취소·저장이 있고, 단축키는 ⌘/Ctrl+S 또는 ⌘/Ctrl+Enter 저장, Esc 입력칸에서 빠지기(한 번 더 누르면 편집기 나가기, 바뀐 것이 있으면 확인), Alt+1–4 팔레트 순서대로 단계 추가다. 위 탭으로 목록이나 실행 기록으로 갈 때도 바뀐 것이 있으면 묻는다. 실행 기록 표는 상태, 워크플로(삭제됐으면 "삭제됨" 배지), 실행한 bot, task, 시작, 걸린 시간. 실행을 누르면 같은 캔버스를 상태 색으로 읽기 전용으로 보이고, 단계별 출력과 증거, 승인 단계의 승인·거절, 실행 취소가 있다. 열려 있는 동안 5초마다 다시 읽는다. 작업 상세의 "Save as workflow"로 만든 초안은 편집기로 바로 열린다(`open-workflow`) |
| Plugins | `plugins-view`, `[data-sdk-tab]`, `registry-skill`, `registry-plugin`, `registry-mcp`, `official-list` | `GET /api/settings`, `GET /api/bots`, `GET /api/plugins/catalog`, `POST/DELETE /api/bot-skills`, `POST/DELETE /api/bot-plugins`, `POST /api/bot-{skill,plugin}s/:name/update`, `POST/DELETE /api/bot-mcp-servers`, `POST /api/plugins/install` | 여기 등록한 것은 모든 bot이 타입에 맞게 함께 쓴다(plugin은 Claude bot만). 등록, 삭제, 설치, 업데이트하면 해당 bot을 모두 다시 불러온다. 제목(H1) 아래 Claude·OpenAI·Kiro 탭이 보이는 절(H2)을 바꾼다. 항목은 구분선 행(머리글자 아이콘, 이름, 설명, 쓰는 bot(OpenAI ◎, Kiro K), 경로, 오른쪽 업데이트·삭제)이고, 경로로 등록하는 칸은 "경로로 추가"를 펼쳐야 보인다. Claude 탭: skill, plugin, MCP server, Anthropic 공식 marketplace(두 열 목록, 행마다 설치 버튼). OpenAI 탭: `read_skill` 안내, skill, MCP server. Kiro 탭: skill이 `skill://` resource로 간다는 안내, skill, MCP server |
| Wiki 내보내기·가져오기 | `.wiki-tools`, `.wiki-import`, `.job-list` | `POST /api/bots/wiki/export`, `POST /api/bots/wiki/import`, `POST /api/files`, `GET /api/jobs`, `POST /api/jobs/:id/{cancel,resume}` | Wiki 제목 아래. zip으로 내보내기, 가져오기(zip이나 파일 올리기, 또는 폴더 절대 경로와 이름). 아래 목록이 최근 job의 상태, 진행 막대, 단계 수와 지금 하는 일, 취소, 마지막 단계부터 다시, 내보낸 zip 내려받기, 가져온 페이지 수를 보인다. 보이는 동안 1.5초마다 다시 읽는다 |
| 작업 공간 패널 | `task-workspace`, `.ws-files`, `.ws-diff` | `GET /api/tasks/:id/workspace`, `GET /api/tasks/:id/workspace/diff`, `POST /api/tasks/:id/workspace/remove`, `POST /api/open-folder` | 저장소나 폴더가 있는 작업 상세의 오른쪽(Claude Desktop처럼). 종류(Worktree, 저장소, 폴더), 경로와 브랜치(복사), 기준 커밋, 원본 저장소, 커밋 수, VS Code로 열기, 폴더 열기, PR 또는 비교 링크, worktree 삭제(확인 창). 바뀐 파일 목록(A·M·D·U와 +/-)을 누르면 아래에 그 파일의 diff를 색으로 보인다 |
| 설정 dialog | `settings-dialog`, `settings-nav` | `GET /api/settings` | 사이드바 아래의 설정. 글로벌 설정이다. 페이지 이름은 H1, 페이지 안의 절은 H2(위 여백과 아래 구분선)다. 왼쪽 메뉴에서 고른 페이지 하나를 오른쪽에 보인다: 화면(언어, 테마, 글꼴, 크기), 연결, 사용량, 폴더, 큐, 알림, 데이터베이스, 구성, 업데이트. 창 가장자리만 남기고 화면을 채우며 메뉴는 고정, 페이지만 스크롤된다. 마지막으로 연 페이지를 기억한다(브라우저 저장소). bot용 skill·plugin 등록은 Plugins 메뉴로 옮겼다. 바꾼 값은 SQLite에 저장되어 재시작과 업그레이드 뒤에도 남는다 |
| 업데이트 | `update-status`, `update-check`, `.update-progress` | `GET /api/update`, `POST /api/update`, `GET /api/update/progress` | 설정 dialog의 업데이트 페이지. 열 때 설치된 버전과 GitHub의 최신 akbun-taskq release를 보이고, 단일 바이너리로 돌 때 새 버전이 있으면 설치 버튼이 나온다. 설치를 누르면 상태 아래에 진행 막대와 "42% · 12.3 / 29.1 MB"가 보이고(내려받은 뒤에는 "100% · 압축 푸는 중…", 길이를 모르면 움직이는 막대와 받은 MB), 0.25초마다 진행률을 읽는다. 설치하면 실행 파일을 바꾸고, taskq를 다시 시작하면 새 버전이 적용된다. 소스(checkout)로 돌면 git pull 안내만 보인다 |
| 주간 점검 | `review-days`, `review-report` | `GET /api/review?days=`, `PUT /api/bots/:name` | 설정 dialog의 주간 점검 페이지. 끌 후보(쓰지 않는 bot, 매번 실패하는 bot)와 끄기 버튼, bot별 turn·성공률·작업 완료/실패·마지막 turn, 직접 확인할 최근 결과 5개(작업 열기) |
| 연결(Connections) | `.conn-runtime[data-runtime]`, `[data-method]`, `[data-test]`, `[data-clear]`, `[data-result]`, `kiro-sign-in`, `kiro-login` | `GET/PUT /api/connection-settings`, `DELETE /api/connection-settings/:runtime`, `POST /api/connections/test`, `GET /api/aws/profiles`, `POST /api/kiro/login` | 설정 dialog의 연결 페이지. 제목(H1) 아래 Claude, OpenAI, Kiro(AWS) 절(H2). 절마다 인증 방식을 고르면 그 방식에 필요한 칸만 보인다: Claude는 API key, 구독(안내만), AWS 프로파일과 region; OpenAI는 API key, 구독(Codex CLI 안내만), AWS 프로파일과 region; Kiro는 SSO start URL과 region. 버튼은 연결 테스트, 저장, 지우기(Kiro는 AWS SSO로 로그인도). 연결 테스트는 고른 방식의 검사를 5초 안에 돌려 초록 체크(연결됨) 또는 빨간 X와 이유를 보이고, 통과하면 로그인 실패로 꺼진 bot을 다시 켠다. 저장하면 연결 테스트를 바로 돌린다. Claude 절의 방식은 자기 방식이 없는 Claude bot의 기본값으로 저장되고, OpenAI와 Kiro의 방식 선택은 채울 칸만 고른다. 지우기는 그 절의 저장값과 key를 지운다. key는 다시 보이지 않고 빈 칸은 저장된 key를 유지한다. 페이지를 열면 절마다 고른 방식의 현재 상태(`GET /api/connections`, 서버에서 1분 캐시라 방금 돌린 테스트 결과가 남음)를 바로 보인다. OpenAI 방식 선택은 다시 열어도 유지되고 Claude는 저장한 방식이 보인다. 방식을 바꾸면 그 방식의 상태가 보이고, 저장값을 읽지 못하면 그 오류가 남는다 |
| 사용량(Usage) | `usage-period`, `usage-report`, `.usage-card`, `.usage-table` | `GET /api/usage?period=` | 설정 dialog의 사용량 페이지. 기간(오늘, 7일, 30일, 전체)을 고르면 SDK·로그인 방식별 카드(비용, turn, 입력·출력·캐시 토큰)와 일회성 작업 실행 카드, bot 세션별 표(bot, SDK, 모델, 세션, turn, 입력, 출력, 비용, 마지막)를 보인다. Kiro는 credit, ChatGPT 구독은 "구독"으로 보인다 |
| 언어와 테마 | `ui-language`, `ui-theme` | `POST /api/settings/appearance` | 언어는 한국어(기본)와 English, 테마는 라이트(기본), 다크, 시스템. 바꾸는 즉시 적용된다 |
| 폴더 | `folder-list`, `.folder-row`, `.folder-group` | `GET /api/settings`(`paths.sessions`), `POST /api/open-folder` | 공용 폴더, taskq 데이터 폴더, 세션 대화 기록은 절 제목(H2, 위 여백과 아래 구분선)이고 런타임 이름은 소절(H3)이다. 공용 폴더, taskq 데이터 폴더, 그리고 세션 대화 기록을 런타임별로(Claude Code `~/.claude/projects`, Codex `~/.codex/sessions`, Kiro kiro-cli 데이터 폴더) 경로와 열기 버튼으로 보인다. 아직 없는 폴더는 열기 대신 아직 없음. API key·Bedrock OpenAI bot이 대화를 어디에 두는지 안내한다 |
| 글꼴 설정 | `font-family`, `font-size`, `font-size-value` | `POST /api/settings/appearance` | 글꼴(System, Pretendard, Noto Sans KR, IBM Plex Sans, Serif, Monospace)과 크기(12~20 px). 바꾸는 즉시 앱 전체에 적용되고 SQLite에 저장되어 다음에 열 때도 유지된다. 설치되지 않은 글꼴은 시스템 글꼴로 보인다 |
| 큐 자동 실행 | `queue-autorun` | `POST /api/settings/queue-autorun` | 켜면(기본) owner 없는 ready task를 큐가 스스로 실행한다. 끄면 시작 버튼을 눌러야 실행된다. bot의 task는 이 설정과 상관없이 그 bot을 기다린다 |
| bot용 skill·plugin(Plugins 메뉴 안) | `registry-skill`, `registry-skill-form`, `registry-plugin`, `registry-plugin-form` | `POST/DELETE /api/bot-skills`, `POST/DELETE /api/bot-plugins` | 절대 경로로 skill 폴더(SKILL.md)와 plugin 폴더(.claude-plugin/plugin.json)를 등록하고 `−`로 지운다. 업데이트 버튼은 git 저장소면 `git pull --ff-only`로 받고, 쓰는 bot을 모두 다시 불러온 뒤 결과를 알린다. 등록하거나 지우면 해당 bot을 모두 다시 불러온다. 폴더가 사라지면 missing 표시 |
| 구성 값 | `settings-config` | `GET /api/settings` | `taskq.config.json`에서 읽은 값을 읽기 전용으로 보인다. 바꾸려면 파일을 고치고 다시 시작해야 한다는 한 줄이 함께 있다. 웹에서 바꾸는 경로는 없다 |
| 작업 owner | 보드 카드의 `.badge.owner`, 작업 상세의 `task-owner` | `GET /api/tasks`, `GET /api/bots`, `POST /api/bots/tasks/:id/owner` | 카드에는 owner agent가 `@coder`처럼 배지로 붙는다. 상세 dialog의 Owner 행은 선택 목록이다. 다른 agent를 고르면 그 agent에게 넘기고, `user (no agent)`를 고르면 되찾는다. 끝난 작업은 글자만 보인다 |
| 작업 상세 접근 스킬 | `task-detail`의 Access skill 행 | `GET /api/settings` | 작업이 쓰는 접근 스킬의 이름과 등록된 경로를 보인다. 등록이 없어졌으면 `(not registered)`를 붙인다 |

## 확인 필요 패널의 알림별 버튼

| 알림 종류 | 버튼 |
|---|---|
| `approval_required` | Review (승인 패널로 이동한다. 승인 결정은 거기서 한다) |
| `auth_required` | Resume |
| `review_ready` | Mark done(normal 등급이라 지금은 목록에 보이지 않는다. 작업 상세의 Done으로 처리한다) |
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

서버는 같은 프로세스에서 이벤트가 기록되면 즉시 스트림으로 보내고, CLI처럼 다른 프로세스가 기록한 이벤트는 `pollSec`(기본 60초) 안에 보낸다. `/api/events/stream?token=...`을 EventSource로 구독하고, 이벤트가 올 때마다 250 ms 디바운스 후 보이는 화면을 다시 그린다. EventSource는 헤더를 보낼 수 없어서 토큰을 쿼리로 보낸다. 스트림은 현재 끝(tail)부터 시작하므로 페이지를 열 때 과거 이벤트를 다시 받지 않는다. 스트림이 끊기면 5초 폴링으로 바꾸고, 다시 연결되면 폴링을 멈춘다. 401이나 토큰 없음이면 스트림과 폴링을 모두 멈추고 토큰 안내를 보인다. 캘린더는 실행 중인 블록이 현재 시각까지 늘어나도록 30초마다 다시 그린다.

## 토큰

`taskq run`은 `http://127.0.0.1:<port>/#token=<hex>`를 출력한다. 페이지는 로드할 때 fragment에서 토큰을 읽고, `sessionStorage`에 이 탭용으로 보관한 뒤 `history.replaceState`로 주소창에서 fragment를 지운다. 모든 `/api` 요청은 `x-taskq-token` 헤더로 토큰을 보낸다. 토큰은 링크, 로그, DOM 어디에도 쓰지 않는다. 새 탭은 저장된 토큰이 없으므로 `taskq run`이 출력한 URL을 다시 열어야 한다.

## 디자인 토큰

UI는 Meta의 Astryx 디자인 시스템(neutral 테마)을 토큰 계약으로 따른다. 구조와 규칙은 [architecture.md](./architecture.md)의 "UI theme" 절에 있다.

- 컴포넌트 CSS가 읽을 수 있는 토큰 목록은 `workspace/ui/css/theme/contract.css`에 있고, 값은 `workspace/ui/css/theme/astryx.css`가 dark와 light로 채운다. 이전 테마 `soft.css`, `carbon.css`도 같은 계약을 구현한다.
- 나머지 CSS 파일과 JS는 색 값을 직접 쓰지 않고 계약 토큰만 참조한다. `test/ui-tokens.test.ts`가 검사한다.
- 아이콘은 `workspace/ui/js/core/icons.js`의 SVG 선 아이콘(24px 격자, 선 두께 1.8) 하나로 통일한다. 정적 마크업은 `data-icon="이름"`, 코드는 `icon(이름)`을 쓴다. 유니코드 글리프를 아이콘으로 쓰지 않는다.
- 상태는 상자 한쪽 줄무늬로 표시하지 않고, 상태 색을 섞은 1px 전체 테두리와 배경 tint로 표시한다.
- 텍스트 선택, caret, 스크롤바, 기본 컨트롤 색, 표와 시각의 고정폭 숫자도 테마 토큰을 따른다.
- 상태 색(`--done`, `--failed`, `--needs-approval`, `--needs-auth`, `--review`, `--running`, `--stale`)은 각각 독립된 값이고, 알림과 tag 배경은 `--error-soft`, `--warning-soft`, `--success-soft`, `--info-soft`를 쓴다.

## 로컬에서 확인하기

`workspace/`에서 데모를 띄우고 출력된 URL을 브라우저에서 연다. 주소창의 `#token=` 부분까지 포함해서 열어야 데이터가 보인다.

```bash
npm run demo
```

데모는 가짜 데이터를 넣고 큐를 멈춘 채로 뜨므로 어떤 세션도 시작되지 않는다. 내 데이터로 서버만 띄워 보려면 `wiki/development.md`의 "Never start a real session by accident" 절차를 따른다. `taskq add`는 `--draft`를 붙이지 않으면 바로 실행 대기열에 들어간다. 승인 패널을 확인하려면 승인 요청을 가진 작업이 필요하다. 이 작업은 `src/runner/approval.ts`의 `askApproval`로 만든다.
