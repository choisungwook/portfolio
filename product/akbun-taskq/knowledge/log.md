# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-21

* **Update**: [bots execute tasks](decisions/2026-11-bots-execute-tasks.md)에 초안에 owner를 정할 때 알림이 bot을 깨우지 않는다는 결정을 더했다 (0.40.0).
* **Update**: 결정 문서를 정리했다. 코드와 어긋난 [task worktrees](decisions/2026-11-task-worktrees.md)(유형과 무관한 체크박스), [task not tied to session](decisions/2026-11-task-not-tied-to-session.md)(stale·needs_auth는 세션 유지), [openai bot backend](decisions/2026-11-openai-bot-backend.md)(도구 수, 경로별 대화, 권한 모드), [soft theme sidebar](decisions/2026-11-soft-theme-sidebar.md)(주간 점검 메뉴), [desktop app shell](decisions/2026-11-desktop-app-shell.md)(진행 줄과 재시작), [bot workspace](decisions/2026-11-bot-workspace.md), [workflows run by bots](decisions/2026-11-workflows-run-by-bots.md), [task ownership](decisions/2026-11-task-ownership-and-discussions.md)를 고쳤다. 예산 이야기는 [rejected turns](decisions/2026-11-rejected-turns.md)에서 [no usage limits](decisions/2026-11-no-usage-limits.md)로 옮겨 한 곳에만 두고, 중복된 설명(오케스트레이터 하나, Claude 로그인 실패, carbon.css)은 원본 문서 링크로 바꿨다. [inference providers](decisions/2026-11-inference-providers.md)에 bot별 sign-in을 덧붙였다.
* **Update**: [task worktrees](decisions/2026-11-task-worktrees.md)에 저장소 여러 개, worktree 체크박스, 사라진 worktree 다시 만들기(0.37.0)를 추가.
* **Creation**: [builtin taskq skill](decisions/2026-11-builtin-taskq-skill.md) - 모든 bot이 실행 중인 버전의 taskq skill과 매뉴얼을 갖는 결정.
* **Creation**: [task not tied to session](decisions/2026-11-task-not-tied-to-session.md) - 재시도는 새 세션으로 하고 직전 run의 기록을 프롬프트로 넘기는 결정.
* **Update**: [session handover](decisions/2026-11-session-handover.md)에 Claude 세션의 auto-compact를 항상 켠다(0.32.0)는 내용을 추가.
* **Update**: [bots execute tasks](decisions/2026-11-bots-execute-tasks.md)에 시작 버튼은 owner가 있어야 켜진다(0.31.0)는 내용을 추가.
* **Creation**: [turn steps in conversation](decisions/2026-11-turn-steps-in-conversation.md) - bot의 도구 호출을 `team_turn_steps`에 남기고 대화에 접어 보이는 결정.
* **Update**: [no usage limits](decisions/2026-11-no-usage-limits.md)에 0.28.0에서 bot별 Limits를 없앤 내용을 추가.

## 2026-11-20

* **Creation**: [no usage limits](decisions/2026-11-no-usage-limits.md) - 시간당 turn 상한과 설정의 사용량 제한 페이지를 없앤 결정.
* **Update**: [resident agent team](decisions/2026-11-resident-agent-team.md), [rejected turns](decisions/2026-11-rejected-turns.md), [bot workspace](decisions/2026-11-bot-workspace.md), [session handover](decisions/2026-11-session-handover.md)에서 시간당 turn 상한과 SQLite에 저장하던 제한 값을 지움.
* **Creation**: [shared registry and sign-in](decisions/2026-11-shared-registry-and-signin.md) - registry를 타입별로 공유하고, Claude bot도 인증 방식을 고르고, 연결을 방식별 5초 테스트로 바꾸고, routine을 없앤 결정.
* **Update**: [marketplace plugin install](decisions/2026-11-marketplace-plugin-install.md)의 "설치와 사용이 분리된다"를 설치가 곧 모든 Claude bot의 사용이라는 내용으로 고침.
* **Update**: [bots execute tasks](decisions/2026-11-bots-execute-tasks.md)에서 skill·plugin을 bot마다 고른다는 내용을 공유로 고침.
* **Update**: [bot runtimes](decisions/2026-11-bot-runtimes-beyond-sdks.md)의 되돌리기 계기를 "다시 확인"에서 연결 테스트로 고침.
* **Creation**: [marketplace plugin install](decisions/2026-11-marketplace-plugin-install.md) - 공식 marketplace에서 고정 commit으로 설치하는 결정.
* **Creation**: [session transcript locations](decisions/2026-11-session-transcript-locations.md) - 세션 기록을 옮기지 않고 런타임별로 보이는 결정.
* **Update**: [inference providers](decisions/2026-11-inference-providers.md)에 설정에서 저장하는 Anthropic API key(평문, 0600, DB 밖)와 암호화하지 않은 이유를 추가.
* **Update**: [bun binary release](decisions/2026-11-release-bun-binary.md)에 0.22.2부터 Linux 바이너리를 만들지 않는 결정과 이유를 추가.
* **Update**: [desktop app shell](decisions/2026-11-desktop-app-shell.md)에 `TASKQ_HOME`이 없을 때 앱이 `~/.taskq`를 home으로 쓰는 결정과 이유(Finder의 현재 디렉터리 `/`)를 추가.
* **Update**: [bot runtimes](decisions/2026-11-bot-runtimes-beyond-sdks.md)에 로그인 실패를 확실할 때만 판정하는 기준(Kiro는 whoami, Bedrock은 프로파일의 자격 증명)과 Kiro 로그인을 터미널 아래에서 실행하는 결정을 추가.
* **Add**: [The macOS desktop app is a Tauri window around the released executable](decisions/2026-11-desktop-app-shell.md)
* **Update**: 결정 기록을 정리해 서로 어긋나던 부분을 마지막 결정으로 맞춤. 지운 파일과 합친 파일은 없고, 뒤집힌 부분만 다시 썼다.
* **Update**: [resident bots](decisions/2026-11-resident-agent-team.md)를 다시 씀. 고정 역할 agent, 읽기 전용 bot, 기본 꺼짐, 하루·turn당 예산과 그 근거, 세션 교체 정책 없음을 빼고 지금의 turn 한도와 Pause만 남김.
* **Update**: [token contract and Carbon patterns](decisions/2026-11-carbon-design-system.md)를 다시 씀. Carbon이 기본 테마라는 서술을 빼고 토큰 계약과 남은 패턴만 남김.
* **Update**: [sidebar and Bots](decisions/2026-11-soft-theme-sidebar.md)를 다시 씀. soft가 기본 테마라는 서술을 빼고 사이드바 배치만 남겼으며, 상단 바 삭제(0.16.0)를 반영.
* **Update**: [Astryx design tokens](decisions/2026-11-astryx-design-system.md)에 라이트 기본과 이전 테마 파일을 화면에서 고를 수 없다는 점을 더함.
* **Update**: [OpenAI bot backend](decisions/2026-11-openai-bot-backend.md), [workflows](decisions/2026-11-workflows-run-by-bots.md), [bots execute tasks](decisions/2026-11-bots-execute-tasks.md)에서 없어진 bot 예산을 가리키던 문장을 고침.
* **Update**: [task ownership and discussions](decisions/2026-11-task-ownership-and-discussions.md)에서 Team 탭과 lead를 지금의 bot 대화와 taskq로 고치고, 토론에 화면 메뉴가 없음을 반영.
* **Update**: [task permission profiles](decisions/2026-11-permission-profiles.md)에 큐와 시작 버튼의 실행에만 적용되고 bot은 bot별 권한 모드를 쓴다는 범위를 더함.
* **Update**: [bot runtimes](decisions/2026-11-bot-runtimes-beyond-sdks.md)에 로그인 실패로 꺼진 bot을 통과한 재확인에서 되돌리는 결정을 추가.
* **Update**: [rejected turns](decisions/2026-11-rejected-turns.md)에 bot 예산(하루, turn당, 80% 표시)을 없앤 결정과 이유를 반영.
* **Creation**: [session handover](decisions/2026-11-session-handover.md) 결정 기록. 토큰 한도를 넘은 대화를 bot의 인수인계 메모와 함께 새 세션으로 넘김.
* **Creation**: [rejected turns](decisions/2026-11-rejected-turns.md) 결정 기록. 거부된 turn은 재시도하지 않고 비용 0, 예산 80% 표시.
* **Update**: [Bedrock inference profiles](decisions/2026-11-bedrock-inference-profiles.md)에 도구와 reasoning을 함께 받지 않는 모델을 `reasoning_effort: none`으로 다시 부르는 결정과 이유를 추가.

## 2026-11-19

* **Creation**: [Bedrock inference profiles](decisions/2026-11-bedrock-inference-profiles.md) 결정 기록. 목록 조회, `openai.*` → profile 치환, 직접 쓴 SigV4.
* **Update**: [bot workspace](decisions/2026-11-bot-workspace.md)에 bot 기본 작업 폴더를 `shared/bots/<bot>`으로 옮긴 결정과 이유를 추가.
* **Update**: [soft theme sidebar](decisions/2026-11-soft-theme-sidebar.md)에 0.15.0 사이드바 순서(taskq 위 가운데, 메뉴 위, Bots 아래)와 Graph 삭제를 반영.
* **Creation**: [impeccable craft floor](decisions/2026-11-impeccable-ui-floor.md) 결정 기록. 점검 방법, 측정값, SVG 아이콘·줄무늬 금지·AA 대비 규칙.
* **Creation**: [Astryx design tokens](decisions/2026-11-astryx-design-system.md) 결정 기록. React 컴포넌트 대신 토큰만 옮기고 soft·Carbon은 남김.
* **Update**: [soft theme and sidebar](decisions/2026-11-soft-theme-sidebar.md)에 Proposals·Goals·Discussions 메뉴 제거와 기본 테마 변경을 더함.
* **Update**: [Bots share one folder](decisions/2026-11-bot-workspace.md)에 bot 결과물을 `outputs/<bot>/`에 두고 `send_message` files로 넘기는 것과, HTML 미리 보기를 ticket URL과 sandbox CSP로 띄우는 이유를 더함.
* **Update**: [resident agent team](decisions/2026-11-resident-agent-team.md)에 사용자가 말을 건 bot은 직접 답한다는 변경을 더함.
* **Update**: [resident agent team](decisions/2026-11-resident-agent-team.md)에 bot 꺼짐 모드를 없애고 항상 돌게 한 이유를 더함.
* **Update**: [ChatGPT-plan and Kiro bots run their own CLIs per turn](decisions/2026-11-bot-runtimes-beyond-sdks.md)에 로그인 실패 범위(bot만 끔)와 런타임 변경 시 세션 초기화의 이유를 더함.
* **Creation**: [ChatGPT-plan and Kiro bots run their own CLIs per turn](decisions/2026-11-bot-runtimes-beyond-sdks.md) 결정 기록. provider 선택, codex exec, kiro-cli headless와 SSO, `taskq mcp --bot`, Usage와 context.

## 2026-11-18

* **Creation**: [A code task in a git repository works in its own worktree](decisions/2026-11-task-worktrees.md) 결정 기록. 생성 시점 worktree, data.repo 교체, 삭제 후 경로 유지, 토큰 없는 PR 링크.
* **Creation**: [Wiki export and import run as resumable background jobs](decisions/2026-11-wiki-transfer-jobs.md) 결정 기록. checkpoint job, deflate level 9, 소화하는 가져오기.
* **Update**: [OpenAI bots plug in behind TeamBackend](decisions/2026-11-openai-bot-backend.md) 결정 기록. skill은 read_skill, MCP server는 MCPServerStdio로 두 SDK가 공유.
* **Creation**: [Workflows are step graphs a bot executes and taskq judges](decisions/2026-11-workflows-run-by-bots.md) 결정 기록. 단계 그래프, bot 실행, taskq 판정, snapshot과 삭제 표시.
* **Creation**: [OpenAI bots plug in behind TeamBackend](decisions/2026-11-openai-bot-backend.md) 결정 기록. Responses API 대화, 권한 모드로 도구 선택, 토큰 기반 비용 추정.
* **Creation**: [The CLI and MCP server reach every route through one table of operations](decisions/2026-11-operations-for-cli-and-mcp.md) 결정 기록. operation 표, 프로세스 안 호출, DB marker로 취소.
* **Update**: [Resident role agents are resumed sessions with a mailbox](decisions/2026-11-resident-agent-team.md) 결정 기록. 일하는 bot에게 온 메시지를 진행 중 turn에 넣는 것을 기록.
* **Creation**: [Bots share one folder, keep memory and settings in SQLite](decisions/2026-11-bot-workspace.md) 결정 기록. 공용 폴더, JSON 업로드, bot 메모리, SQLite 설정, 대화 검색, 취소 처리.
* **Creation**: [Bots work on their own tasks with per-bot permissions](decisions/2026-11-bots-execute-tasks.md) 결정 기록. bot이 task를 직접 처리, bot별 권한 모드·샌드박스·차단 명령, 시작 버튼은 일회성, taskq 오케스트레이터.
* **Update**: [Resident role agents are resumed sessions with a mailbox](decisions/2026-11-resident-agent-team.md) 결정 기록. 읽기 전용 bot 설계가 bot별 권한 설정으로 바뀐 것을 기록.
* **Creation**: [The UI uses a soft messenger theme and a left sidebar where bots read like chats](decisions/2026-11-soft-theme-sidebar.md) 결정 기록. Team을 Bots로, 탭을 사이드바와 bot별 채팅으로, 기본 테마를 soft로.
* **Update**: [The taskq UI follows IBM Carbon through a token interface](decisions/2026-11-carbon-design-system.md) 결정 기록. 기본 테마가 soft로 바뀌고 Carbon은 패턴과 두 번째 테마로 남음.
* **Creation**: [A task has one owner agent; several agents meet only in a bounded discussion](decisions/2026-11-task-ownership-and-discussions.md) 결정 기록. owner 열, 중복 작업 검사, 순서와 라운드가 정해진 토론.
* **Creation**: [Team wiki search is trigram FTS plus link expansion, behind a WikiSearch interface](decisions/2026-11-wiki-hybrid-search.md) 결정 기록. 벡터 검색 대신 trigram과 링크 확장, graphify용 파일 미러.
* **Update**: [Resident role agents are resumed sessions with a mailbox](decisions/2026-11-resident-agent-team.md) 결정 기록. 리뷰 반영: 쓰기 뒤 실패한 turn 재시도 안 함, 예산 범위, deliver_at, 확인 필요 항목.
* **Creation**: [Resident role agents are resumed sessions with a mailbox, and work still runs as tasks](decisions/2026-11-resident-agent-team.md) 결정 기록. 상주 프로세스 대신 resume, 동기 호출 대신 mailbox, agent는 읽기만 하고 일은 큐 작업으로.

## 2026-11-16

* **Creation**: [The runner waits on an in-process wake signal with a 60 second fallback](decisions/2026-11-wake-instead-of-poll.md) 결정 기록. 폴링 2초를 60초로 바꾸고 같은 프로세스 변경은 신호로 깨움.
* **Update**: [Approval waits on a database row, woken by events](decisions/2026-11-db-driven-approval.md) 결정 기록. 1초 폴링에서 이벤트 신호와 60초 fallback으로 바뀜.
* **Creation**: [The taskq UI follows IBM Carbon through a token interface](decisions/2026-11-carbon-design-system.md) 결정 기록. Carbon 선택 이유와 USWDS, GOV.UK를 고르지 않은 이유.
* **Creation**: [Carbon Design System principles and patterns used by the taskq UI](references/carbon-design-system.md) 참고 자료 사본. 원칙, 상태 표시 규칙, 알림 규칙.
* **Creation**: [New features start from an interface](decisions/2026-11-interface-first.md) 결정 기록. The interface comes first and callers import only it; the first implementation is wired in one place.
* **Creation**: [Agent SDKs plug in behind one AgentBackend interface](decisions/2026-11-agent-backend-interface.md) 결정 기록. createWorker, preflight and ask; the gate policy stays shared and each backend maps its own hook to it.
* **Creation**: [A call that reaches taskq itself stops the run for review](decisions/2026-11-tamper-stops-run.md) 결정 기록. Sandbox-off, data directory, taskq config and ~/.claude writes end the session; the PreToolUse hook is fail-closed.
* **Creation**: [Release a bun-compiled binary that embeds Claude Code](decisions/2026-11-release-bun-binary.md) 결정 기록. One executable per platform built by bun; Node SEA and requiring an installed claude were rejected.
* **Update**: [Run TypeScript by type stripping and ship the UI as static modules](decisions/2026-11-no-build-typescript-static-ui.md) 결정 기록. The no-build reason now covers development only; the released binary is packaging.

## 2026-11-15

* **Update**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. Reads are confined by path, and project settings load only for trusted repositories.
* **Update**: [Approval waits by polling the events table](decisions/2026-11-db-driven-approval.md) 결정 기록. The wait now polls the `approvals` row, which binds the decision to one request id.
* **Creation**: [Approval shows and stores the exact input, bound to a request id](decisions/2026-11-approval-shows-exact-input.md) 결정 기록. The unmasked input lives in its own table until decided; decisions name a request id and the API needs a per-start token.
* **Update**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. Added the reason that gating moved into PreToolUse hooks; the 'ask' behavior is not yet exercised with a real session.
* **Creation**: [Store tasks in SQLite, not in markdown, JSON or YAML files](decisions/2026-11-storage-sqlite.md) 결정 기록. One SQLite file in WAL mode holds every table; plain files were rejected because of locking.
* **Creation**: [Run TypeScript by type stripping and ship the UI as static modules](decisions/2026-11-no-build-typescript-static-ui.md) 결정 기록. No bundler and no UI framework; the first idea was React with Vite and a calendar library.
* **Creation**: [Three inference providers selected by config](decisions/2026-11-inference-providers.md) 결정 기록. bedrock, api_key and subscription differ only in the child environment taskq builds.
* **Creation**: [Approval waits by polling the events table](decisions/2026-11-db-driven-approval.md) 결정 기록. A pending approval is a database row, not an in-memory promise.
* **Creation**: [Permission profiles follow how the SDK evaluates a tool call](decisions/2026-11-permission-profiles.md) 결정 기록. What the SDK documentation changed in the original permission plan.
