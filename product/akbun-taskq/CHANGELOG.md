# akbun-taskq Changelog

<!-- markdownlint-configure-file {"MD024": {"siblings_only": true}} -->

## 0.9.0

이 버전은 task 큐 위에 역할을 가진 상주 bot을 더한다. 처음 읽는 agent는 `wiki/architecture.md`의 Bots 절과 `wiki/sdk-usage.md`를 먼저 읽는다. 결정의 이유는 `knowledge/decisions/`의 2026-11-bots-execute-tasks, 2026-11-resident-agent-team, 2026-11-task-ownership-and-discussions, 2026-11-wiki-hybrid-search, 2026-11-soft-theme-sidebar, 2026-11-bot-workspace, 2026-11-workflows-run-by-bots, 2026-11-openai-bot-backend, 2026-11-operations-for-cli-and-mcp에 있다.

### Added

- 상주 bot. bot마다 역할, 설명, 지시, 자기 Claude 세션을 갖고, 메시지가 올 때마다 그 세션을 이어서(`resume`) 한 turn 일한다. 프로세스를 띄워 두지 않으므로 taskq를 다시 시작해도 대화가 이어지고, 쉬는 bot은 비용이 없다. `bots.enabled`로 켜며 기본은 꺼져 있다.
- 오케스트레이터 bot `taskq`. 처음부터 있고, 지우거나 끌 수 없고, 목록 맨 위에 고정된다. 나머지 bot은 사용자가 만들고 지운다(planner, coder, reviewer, doc-reviewer 프리셋).
- bot이 task를 직접 처리한다. owner bot만 `start_task`로 시작하고 같은 turn 안에서 `finish_task`로 done, review, failed 중 하나로 닫는다. 실행은 `runs.bot`에 남아 Calendar에 보인다. turn이 끝날 때 닫지 않은 task는 ready로 돌아가고, 지운 bot의 task는 owner 없는 draft가 된다.
- bot별 설정: 권한 모드(기본 auto), 샌드박스(기본 끔)와 허용 호스트, 차단 명령(기본 없음, 명령 어디에 있어도 매칭), 작업 디렉터리, 모델, 시간당 turn·turn당 예산·turn당 모델 턴 제한, skill과 plugin 선택.
- bot 사이 비동기 mailbox, `deliver_at` 예약 메시지, 순서와 라운드가 정해진 토론(moderator가 결론을 wiki에 남김).
- task owner. task 하나에 bot 하나. Board 배지, task 상세의 owner 변경, bot 대화의 작업 칩. 비슷한 열린 작업을 만들면 거절(글자 trigram 유사도 0.5, 권고 수준).
- 공유 wiki. revision 비교로 동시 쓰기를 막고, trigram 검색(한국어 조사 포함)과 `[[slug]]` 링크 1단계 확장, `TASKQ_HOME/wiki/` markdown 사본(graphify 같은 도구용).
- bot 메모리. bot마다 16,000자까지, 매 turn system prompt에 붙고 bot은 `memory_write`로, 사용자는 우클릭 메뉴의 메모리 창으로 고친다.
- 공용 폴더 `TASKQ_HOME/shared`. 모든 bot 세션에 같은 경로로 연결되고(`additionalDirectories`), 왼쪽 메뉴의 공용 폴더에서 보고 올리고 내려받는다.
- 첨부파일. 새 작업과 bot 대화에서 끌어다 놓기, 붙여넣기(스크린샷 포함), 파일 선택으로 올리고 `shared/attachments/`에 저장한다. 작업과 bot의 프롬프트에 절대 경로가 들어간다.
- 모든 bot 대화 검색(왼쪽 메뉴의 검색 아이콘, Cmd/Ctrl+K). trigram 색인을 trigger로 유지하고 짧은 단어는 LIKE로 찾는다. 결과를 누르면 그 대화의 그 메시지로 이동한다.
- 대화 안 찾기(Cmd/Ctrl+F), 작업 중 표시(사이드바 아바타 둘레의 회전 고리와 경과 시간, 대화 아래의 작업 바), Esc와 Stop으로 turn 취소.
- 글로벌 설정: 언어(한국어 기본, 영어), 테마(시스템, 다크, 라이트), 글꼴과 크기, 전체·bot별 사용량 제한, 큐 자동 실행, bot용 skill·plugin 등록과 업데이트(`git pull --ff-only` 후 사용하는 bot 재로드), 공용 폴더·세션 대화 기록·데이터 폴더 열기.
- bot 우클릭 메뉴: 대화 열기, 설정, 메모리, skill·plugin 다시 불러오기, 새 세션, 세션 폴더 열기, 진행 중 작업 취소, 끄기·켜기, 삭제.
- bot 아바타 오른쪽 아래에 실행 SDK 표시(Claude ✻, OpenAI ◎). 왼쪽 bot 목록에 두 SDK의 bot이 함께 보인다.
- OpenAI bot. bot 설정의 Agent SDK에서 OpenAI Agents SDK를 고르면 같은 mailbox, 도구, 제한, 게이트로 돈다. auto 모드가 없어서 권한 모드(plan, accept edits, bypass)가 bot이 받는 파일·셸 도구를 정한다. `OPENAI_API_KEY`가 필요하고, 비용은 토큰 수와 `bots.openaiInputPerMTok`·`openaiOutputPerMTok`로 추정한다.
- 일하는 bot에게 보낸 메시지는 기다리지 않고 진행 중인 turn에 들어간다(Claude bot, 한 turn에 최대 10번). OpenAI bot과 빈 turn 자리를 기다리는 bot의 메시지는 큐에 쌓이고, 대화 아래와 bot 목록에 대기 수가 보인다.
- 입력창 아래 메뉴(Claude Desktop처럼): 모델 목록 불러오기와 선택, effort, 권한 모드. 바꾸면 다음 turn부터 적용된다. 새로고침 아이콘은 skill·plugin을 다시 읽고 모델·명령 목록을 새로 불러온다.
- slash command. 입력창에 `/`를 치면 bot의 skill과 plugin 명령 목록이 뜨고, `/이름 인자`로 보낸 메시지는 bot이 그 skill로 처리한다.
- Plugins 메뉴(Claude Desktop처럼). 등록한 skill·plugin 보기, 쓰는 bot 표시, 업데이트, 삭제, 경로로 등록. Anthropic 공식 marketplace 목록을 보여 주기만 하고 설치하지 않는다.
- Workflows 메뉴(n8n처럼 단계 그래프를 만들고, Argo처럼 실행 기록을 본다). 단계 종류는 실행, 검증(증거 필요), 다른 bot에 넘김, 사용자 승인. task에 workflow와 bot을 지정하면 그 bot이 `start_task`에서 실행을 시작하고 단계마다 보고한다. 성공은 bot이 아니라 taskq가 판정한다(검증 단계는 증거, 승인 단계는 사용자 승인, 단계 하나라도 실패하면 실행 실패). 삭제한 workflow는 실행 기록에 삭제됨으로 남고, 그 workflow를 실행 중인 bot은 메시지를 받는다. bot 없는 workflow task는 큐가 실행하지 않는다.
- `taskq bots` 명령: list, new, delete, reload, say, inbox, log, turns, threads, close, wiki, search, export, assign, pause, resume, enable, disable, reset.
- CLI와 MCP로 모든 기능. API 경로마다 이름 붙은 operation(`src/ops/operations.ts`)이 있고, `taskq api <operation> key=value...`와 MCP 도구 `taskq_<operation>`이 같은 표를 쓴다. `taskq workflows`는 workflow를 읽기 쉽게 다루는 명령이다. 경로가 operation에 빠지면 테스트가 실패한다.
- 다른 프로세스(CLI, MCP 서버)에서 bot turn을 취소할 수 있다. 취소 표시를 DB에 남기고 bot을 돌리는 프로세스가 다음 tick에 멈춘다.

### Changed

- 작업 취소는 이제 `cancelled` 상태다(이전에는 failed). failed처럼 다시 시도할 수 있다.
- 큐는 bot이 owner인 task를 자동 실행하지 않는다. owner 없는 ready task의 자동 실행은 설정의 큐 항목으로 끌 수 있다. task의 시작 버튼은 어느 bot에도 속하지 않는 일회성 실행으로 그대로다.
- 화면: 탭 줄 대신 왼쪽 메뉴, 기본 테마는 다크 우선의 둥근 soft 테마(Carbon 테마 파일은 남음), 새 작업의 입력창은 내용에 맞춰 늘어난다.

### Security

- 설정과 관계없이 모든 bot에서 taskq 자신을 건드리는 호출은 그 turn을 멈추고 bot 전체를 멈춘다(`security_finding`). 파일 도구는 경로로, 셸 명령은 데이터 디렉터리·`taskq.db`·`taskq.config.json`을 가리키는 글자로 판단한다. `~/.claude`를 가리키는 셸 명령은 거부한다. 글자 검사는 우회될 수 있고, 확실한 경계는 bot 샌드박스다.
- bot은 사용자의 Claude 설정(`settingSources: []`)을 읽지 않는다.
- skill·plugin 다시 불러오기는 bot 폴더 경로에 symlink가 있으면 거부한다(bot이 심은 symlink로 TASKQ_HOME 밖을 지우는 것을 막음).
- 업로드와 공용 폴더 경로는 공용 폴더 밖으로 나갈 수 없다.
- bot의 셸에서 `taskq` 명령은 거부한다. `taskq api`로 자기 권한, 예산, 승인을 바꿀 수 있기 때문이다(글자 검사라 우회 가능).
- workflow의 검증·승인 단계는 bot이 건너뛸 수 없고, 실행이 실패하거나 취소된 task는 failed로만 닫힌다. workflow가 있는 task는 시작 버튼(일회성 실행)으로 돌릴 수 없다.
- OpenAI bot의 파일·셸 도구도 Claude bot과 같은 게이트를 거친다. `write_file`은 작업 디렉터리와 공용 폴더 안에만 쓰고, `shell`은 bypass 모드이면서 샌드박스를 끈 bot에게만 준다(taskq는 자식 프로세스를 Claude Code처럼 샌드박스에 넣지 못함).

### SDK

`@anthropic-ai/claude-agent-sdk`를 어떻게 쓰는지의 전체 표는 `wiki/sdk-usage.md`에 있다. 이 버전에서 새로 쓰거나 쓰는 방식이 바뀐 것:

- `query()`와 `resume`: bot 한 turn이 query 한 번이다. 세션 id를 `team_agents.session_id`에 두고 다음 turn에 이어 붙인다. 세션이 사라졌다는 오류면 다음 turn에 새 세션을 시작한다. resume한 세션의 `total_cost_usd`는 이전 turn까지의 누적을 포함하므로, 세션의 직전 누적(`team_agents.session_cost_usd`)과의 차이를 turn 비용으로 기록한다.
- 스트리밍 입력(`AsyncIterable<SDKUserMessage>`): in-process MCP 도구는 스트리밍 입력에서만 동작한다. stream을 turn 동안 열어 두고, 일하는 중에 온 메시지를 같은 stream에 넣는다(`src/team/live-input.ts`). 넣는 메시지마다 `uuid`를 붙이고, `result`의 `user_message_uuids`로 답한 메시지를 지운다(SDK가 가까이 온 메시지를 한 turn으로 합칠 수 있음). 답하지 않은 메시지가 없고 `queued_turn_count`가 0이면 stream을 닫아 turn을 끝낸다. `num_turns`는 result마다 더하고, `total_cost_usd`는 세션 누적값이라 마지막 값을 쓴다.
- `Query.supportedModels()`와 `supportedCommands()`: 프롬프트 없이 연 세션에서 모델 목록(effort 지원 여부 포함)과 slash command를 읽어 입력창 메뉴에 쓴다(10분 캐시, 새로고침으로 다시 읽음). 읽지 못하면 내장 목록을 쓰고 그렇다고 표시한다.
- `effort`: bot별 effort(low부터 max)를 세션에 넘긴다.
- `createSdkMcpServer()`와 `tool()`: bot 도구 20개(메시지, 토론, task, wiki, 메모리, workflow)를 `team` 서버로 노출한다. 입력 zod 스키마는 taskq도 handler 전에 다시 검사한다.
- `hooks.PreToolUse`: bot 게이트(tamper 정지, 차단 명령). permission mode보다 먼저 돌고 거부는 모든 모드에서 유지된다.
- `permissionMode`(bot 기본 `auto`), `allowDangerouslySkipPermissions`(bypass를 고른 bot만), `canUseTool`(bot은 승인 대기 없이 거부).
- `sandbox`: bot이 켰을 때만. 쓰기는 작업 디렉터리와 공용 폴더, taskq 데이터 읽기 거부, 네트워크는 허용 호스트.
- `plugins`: bot이 고른 skill을 복사해 만든 로컬 plugin 하나와 고른 plugin들. `strictMcpConfig`는 plugin이 있을 때만 끈다.
- `additionalDirectories`: 공용 폴더. `settingSources: []`, `maxTurns`, `maxBudgetUsd`(bot별 제한), `model`(bot별), `systemPrompt`(claude_code preset에 역할, bot 목록, 규칙, 메모리를 덧붙임).
- 쓰지 않는 것: subagent(`agents`)와 SDK 메모리 파일. 이유는 `wiki/sdk-usage.md`의 마지막 절.

`@openai/agents-core`와 `@openai/agents-openai`(OpenAI Agents SDK, 0.22.0)는 OpenAI bot에 쓴다(`src/agents/openai/team.ts`):

- `Runner`와 `OpenAIProvider`: bot turn 하나가 `runner.run()` 한 번이다. `tracingDisabled: true`로 OpenAI tracing에 대화를 보내지 않는다.
- `previousResponseId`와 `lastResponseId`: Responses API가 대화를 서버에 두므로, 마지막 response id를 bot의 세션 id로 저장해 다음 turn에 넘긴다. 없어졌다는 오류면 다음 turn은 새 대화로 시작한다.
- `tool()`: bot 도구 20개와 파일·셸 도구를 JSON schema(`strict: false`)로 넘긴다. zod 스키마는 `z.toJSONSchema()`로 바꾸고 handler 전 검사는 Claude bot과 같다.
- `maxTurns`, `signal`(취소), `modelSettings.reasoning.effort`(bot의 effort), `runContext.usage`(토큰 수로 비용 추정), `MaxTurnsExceededError`.
- 쓰지 않는 것: `@openai/agents`의 realtime 패키지, handoff(bot 사이 일은 mailbox로), hosted tool.

### Not verified with a real model

- resume한 세션의 transcript에 누적 비용이 없을 때의 비용 계산(직전 누적보다 작으면 전체를 turn 비용으로 봄), resume한 세션에도 `PreToolUse` 거부와 플러그인이 그대로 적용되는지, auto 모드가 셸로 taskq 파일을 건드리는 시도를 막는지. 테스트는 가짜 SDK로 돈다.
- 실행 중인 turn에 넣은 메시지가 `user_message_uuids`로 돌아오는지(돌아오지 않으면 가장 오래된 메시지를 답한 것으로 봄), 프롬프트 없는 세션에서 `supportedModels()`가 응답하는지(응답하지 않으면 20초 뒤 내장 목록으로 대체).
- OpenAI bot은 실제 API로 돌려 보지 않았다. 비용은 설정한 단가로 계산한 추정치다.

## 0.8.0

### Added

- Windows 데스크톱에서 인계와 중요 경고 알림을 표시한다. WSL2에서 실행 중인 taskq도 Windows에 알림을 보낼 수 있다.
- Settings의 Desktop notifications에서 운영체제 알림을 켜고 끌 수 있다. 설정과 앱 내 알림 기록은 재시작 후에도 유지된다.

## 0.7.0

### Added

- 후속 태스크가 완료된 선행 태스크의 실행 ID, 요약과 지정된 산출물 경로를 전달받는다. `Depends on`으로 조사, 설계, 구현을 연결할 수 있다.
- 인계가 도착하면 SQLite에 이력과 알림을 남기고 macOS 알림을 요청한다. 자동 수락을 끈 태스크는 수동 수락을 기다린다.
- 화면과 CLI에서 인계 내역을 보고 수락 모드를 바꿀 수 있다. AI 에이전트는 `taskq mcp`의 읽기 도구로 같은 이력과 수락 설정을 조회할 수 있다.
- Codex의 push 및 PR 생성 전 검사와 GitHub Actions에서 현재 버전의 CHANGELOG 항목을 확인한다.

### Changed

- 태스크를 가져오는 DB 갱신에서도 선행 태스크 상태를 확인해, 선택 직후 선행 작업이 재실행되면 후속 작업을 대기시킨다.
- GitHub 릴리즈 노트의 변경 사항을 해당 버전의 CHANGELOG에서 가져온다.

### Removed

- taskq 릴리즈 노트에서 PR 제목을 모아 변경 사항을 생성하던 방식을 제거했다.

## 0.6.0

### Added

- 보드의 상태별 카드에서 즉시 실행할 수 있다. 검토 완료 또는 종료된 태스크도 다시 실행할 수 있다.

### Changed

- 기본 폴링 간격을 2초에서 60초로 늘렸다. 같은 프로세스의 API 작업과 실행 종료는 큐를 즉시 깨운다.

## 0.5.0

### Changed

- 대시보드와 주요 컨트롤에 IBM Carbon Design System을 적용했다.

## 0.4.0

### Added

- Agent SDK를 교체할 수 있도록 공통 인터페이스와 Claude 구현을 분리했다.

### Changed

- taskq 자체 설정과 데이터에 대한 변조 시도가 감지되면 세션을 중단하고 검토 알림을 남긴다.

## 0.2.0

### Added

- Apple silicon과 Linux x86_64 바이너리에 Claude Code, UI 및 DB 스키마를 내장했다.
- 사용자 지정 CA 번들을 설정할 수 있다.

## 0.1.0

### Added

- 개인용 태스크 큐에 실행 기록, 도구 승인, 종속 관계와 검토 화면을 제공한다.
