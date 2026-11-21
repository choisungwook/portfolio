# akbun-taskq 0.10.0

이 버전은 bot과 task가 실제 저장소와 문서를 다루는 방식을 넓힌다. 처음 읽는 agent는 `wiki/architecture.md`의 Task worktrees, Wiki export and import, Plugins for each SDK 절을 먼저 읽는다. 결정의 이유는 `knowledge/decisions/`의 2026-11-task-worktrees, 2026-11-wiki-transfer-jobs, 2026-11-bot-runtimes-beyond-sdks에 있다.

## Added

- task worktree. 새 작업에서 저장소나 폴더를 고른다(알려진 저장소 목록과 직접 입력). 저장소에서 코드를 고치는 작업은 기본으로 자기 worktree(`TASKQ_HOME/worktrees/<repo>-<task>`, 브랜치 `taskq/<task>`)에서 일하고, 내 checkout은 바뀌지 않는다. 끌 수 있고, 읽기만 하는 작업과 일반 폴더는 worktree를 만들지 않는다.
- 작업 상세 오른쪽의 작업 공간 패널(Claude Desktop처럼): worktree 절대 경로, 브랜치, 기준 커밋, 바뀐 파일과 파일별 diff(한글 파일명과 이름 바꾼 파일 포함), PR 링크(실행 요약이나 bot 메시지에서 찾음) 또는 GitHub 비교 링크, VS Code로 열기(`vscode://file/<path>`), 폴더 열기, worktree 삭제(커밋은 브랜치에 남고, 커밋하지 않은 변경이 있으면 한 번 더 확인한 뒤에만 지움). 저장소의 하위 폴더를 고르면 worktree 안의 같은 하위 폴더에서 일하고, `trustedRepos` 판정은 원래 저장소로 한다.
- wiki 내보내기: 모든 페이지를 front matter가 붙은 markdown과 `manifest.json`으로 zip(deflate level 9)에 담아 `shared/exports/`에 둔다.
- wiki 가져오기: zip, 폴더, 파일을 bot이 쓸 수 있게 소화한다. 문서마다 페이지, 긴 문서는 `##` 절마다 페이지(절이 없으면 길이로 나눈 여러 페이지, 버리는 글 없음), 문서 사이 상대 링크는 `[[slug]]` 링크, HTML은 글로, 코드와 데이터는 코드 블록으로, 바이너리는 건너뛰고 목록에 남긴다. 마지막에 색인 페이지를 만든다. taskq가 내보낸 zip(`manifest.json`이 있는 것)만 원래 slug로 복원한다.
- 백그라운드 job(`/api/jobs`): 내보내기와 가져오기가 진행률을 보이며 돌고, 취소하면 지금 단계 뒤에 멈추고, "마지막 단계부터 다시"로 checkpoint에서 이어 한다. taskq가 멈춘 동안 돌던 job은 다음 시작 때 이어 한다.
- Plugins 메뉴의 Claude / OpenAI 탭. skill은 두 SDK가 같이 쓰고(OpenAI bot은 `read_skill` 도구로 SKILL.md를 읽음), plugin은 Claude bot만, MCP server는 두 SDK가 같이 쓴다.
- bot용 MCP server 등록(`/api/bot-mcp-servers`)과 bot 설정의 MCP server 선택.
- OpenAI bot의 로그인 방식 선택(bot 설정의 "Sign in with"): OpenAI API 키(Agents SDK, `OPENAI_API_KEY`), Amazon Bedrock(Agents SDK, Bedrock의 OpenAI 호환 endpoint와 `AWS_BEARER_TOKEN_BEDROCK`, gpt-oss 모델, region은 `bots.bedrockRegion`), ChatGPT 구독(사용자가 설치하고 `codex login`으로 ChatGPT에 로그인한 Codex CLI를 `codex exec`로 실행). Bedrock은 서버에 대화를 두지 않으므로 taskq가 bot 폴더에 대화를 보관한다.
- Kiro bot(AWS). 설정의 Kiro 절에서 IAM Identity Center start URL과 region을 넣고 로그인하면 `kiro-cli login --use-device-flow`가 보여 주는 URL과 코드를 화면에 띄운다. bot turn은 bot 폴더에서 `kiro-cli chat --no-interactive --output-format stream-json`으로 돌고, bot은 Kiro agent 파일(역할, bot 도구 MCP, MCP server, skill)로 쓰인다. 권한 모드가 Kiro의 도구 목록과 trust 목록을 정한다.
- `taskq mcp --bot <name>`: bot 하나의 도구를 MCP server로 낸다. Codex와 Kiro bot이 이것으로 메시지, task, wiki, workflow 도구를 쓴다.
- 설정의 사용량(Usage): 기간별로 SDK(Claude, OpenAI와 로그인 방식, Kiro)마다 카드, bot 세션마다 모델·turn·입출력 토큰·비용(Kiro는 credit, ChatGPT 구독은 "구독")을 보여 준다. 일회성 작업 실행 비용도 따로 보인다.
- bot마다 context window 원(Claude Desktop처럼): 입력창 아래와 왼쪽 bot 목록에 마지막 turn이 끝났을 때 context가 찬 정도를 원과 %로 보인다. 60%와 85%에서 색이 바뀐다.
- n8n처럼 편집하는 workflow 편집기: 단계 팔레트, 끌어서 옮기는 노드, 오른쪽 점에서 다른 노드로 끌어 연결, 연결 선택 후 Delete로 삭제, 확대·이동·화면 맞춤·자동 정렬, 오른쪽 단계 속성 패널. 노드 위치는 workflow에 저장된다. 순환이 생기는 연결은 거부한다.
- `taskq api`와 MCP 도구에 task 작업 공간, 저장소 목록, wiki 내보내기·가져오기, job, MCP server 등록 operation 추가. `taskq add --no-worktree`.

## Changed

- 왼쪽 bot 목록은 bot이 많으면 목록 안에서 스크롤되고 아래 메뉴는 그대로 보인다.
- 라이트 테마에서 체크박스가 어둡게 보이던 문제(`color-scheme`)와 새 작업 종류 버튼의 대비를 고쳤다.
- OpenAI(로그인 방식별)나 Kiro bot의 로그인이 실패하면 팀 전체를 멈추지 않고 그 bot만 끄고 Must check에 알린다. Claude bot은 로그인을 함께 쓰므로 지금처럼 팀을 멈춘다. Codex와 Kiro의 실패한 turn은 turn 예산을 비용으로 잡지 않는다(0).
- bot의 Agent SDK나 OpenAI 로그인 방식을 바꾸면 세션을 새로 시작한다. 다른 런타임의 세션 id로 resume하지 않는다. 세션 초기화는 context 원과 세션 비용도 비운다.
- 짙은 보조 버튼(헤더와 Wiki의 검색 버튼, 눌린 버튼 묶음)에 짙은 글씨가 쓰이던 문제를 고쳤다. 테마 토큰에 `--on-secondary`와 `--on-danger`를 더해, 라이트 모드는 밝은 버튼에 짙은 글씨, 다크 모드는 짙은 버튼에 밝은 글씨를 쓰고, 빨간 버튼 글씨는 흰색이다.

## Security

- Codex(ChatGPT 구독)와 Kiro bot의 자체 도구 호출은 taskq 게이트를 거치지 않는다. 경계는 각자의 샌드박스와 권한이다: Codex는 plan이 read-only, accept edits가 bot 폴더·공용 폴더·worktree 쓰기(workspace-write), bypass가 전체 접근이고 승인은 묻지 않는다(`approval_policy=never`). Kiro는 trust 목록 밖의 도구를 거부하고 샌드박스 설정이면 `--sandbox`를 붙인다. bot 도구(메시지, task 등)는 `taskq mcp --bot`에서 다른 bot과 같은 검사를 거친다.
- taskq는 ChatGPT, AWS SSO, Bedrock의 토큰을 저장하지 않는다. Codex와 kiro-cli가 각자 보관하고, Bedrock 키는 환경 변수로 받는다.
- MCP server는 내 권한으로 bot 게이트 밖에서 돈다(plugin의 MCP server와 같음). 믿는 서버만 등록하고 키는 환경 변수에 둔다고 화면에 적었다.
- worktree를 지워도 task는 지워진 폴더를 가리키므로, 다시 실행하면 내 checkout에 쓰지 않고 실패한다. diff API는 바뀐 파일 목록에 있는 파일만 보여 준다.
- 가져오기는 zip 항목 5,000개, 풀린 크기 200 MB, 폴더 파일 5,000개·파일당 5 MB까지이고 symlink와 숨김 폴더를 따라가지 않는다. zip 안의 `..` 경로는 버린다.

## SDK

`@anthropic-ai/claude-agent-sdk`:

- `mcpServers`: `team` 서버 옆에 bot이 고른 MCP server를 `{ type: 'stdio', command, args }`로 넣는다.
- `additionalDirectories`와 샌드박스 `allowWrite`에 `TASKQ_HOME/worktrees`를 더해 bot이 task worktree에서 일하게 한다.

`@anthropic-ai/claude-agent-sdk`(이어서):

- `SDKAssistantMessage.message.usage`와 `result.modelUsage[model].contextWindow`: 마지막 모델 호출의 입력(캐시 포함)과 모델의 context window로 context 원을 그린다. turn의 토큰은 result의 `usage`를 더한다.

`@openai/agents-core`, `@openai/agents-openai`:

- `OpenAIProvider({ apiKey, baseURL, useResponses: false })`: Bedrock bot은 `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`의 Chat Completions로 돈다. 대화는 `result.history`를 bot 폴더에 저장했다가 다음 turn의 입력 앞에 붙인다(최대 200개 항목).
- `result.rawResponses.at(-1).usage.inputTokens`: context 원.
- `MCPServerStdio`와 `Agent({ mcpServers })`: bot이 고른 MCP server를 turn마다 bot 작업 디렉터리에서 시작하고 turn 뒤에 닫는다.
- `tool()`: `read_skill` 도구. bot의 skill 이름과 설명을 도구 설명에 두고, 부르면 SKILL.md와 옆 파일 목록을 돌려준다(Claude Code의 skill처럼 필요할 때 읽음).

Codex CLI(ChatGPT 구독, SDK 패키지 없이 `@openai/codex-sdk`와 같은 인자로 실행): `codex exec --experimental-json`, `--sandbox`, `--cd`, `--add-dir`, `--skip-git-repo-check`, `--config approval_policy="never"`, `model_reasoning_effort`, `developer_instructions`(bot의 역할과 규칙), `mcp_servers.*`(bot 도구와 MCP server), `resume <thread_id>`. `thread.started`의 thread id가 세션이고 `turn.completed`의 `usage`가 토큰이다. `@openai/codex-sdk`를 의존성으로 넣지 않은 이유는 플랫폼별 Codex 바이너리(약 400 MB)를 함께 설치하기 때문이다.

Kiro CLI: `kiro-cli chat --v3 --no-interactive --output-format stream-json --agent taskq-<bot>`, `--model`, `--effort`, `--resume`/`--resume-id`, `--trust-tools=…`/`--trust-all-tools`, `--sandbox`; 로그인은 `kiro-cli login --identity-provider <url> --region <region> --use-device-flow`, 상태는 `kiro-cli whoami`. agent 파일은 `name`, `description`, `prompt`, `mcpServers`, `tools`, `resources`(`skill://`), `includeMcpJson: false`.

## Not verified with a real model

- Codex, Kiro, Bedrock은 실제 계정으로 돌려 보지 않았다. 특히 Kiro의 stream-json 기록 형식은 문서에 없어 세션 id, 토큰, credit, context를 아는 이름의 필드에서만 읽는다(못 찾으면 빈 값). Kiro headless가 SSO 로그인 세션으로 도는지는 문서가 말하지 않는다(문서는 API 키를 권하고, 로그인 세션이 API 키보다 먼저 쓰인다고 적는다).
- OpenAI 모델의 context window는 taskq가 아는 값으로 그린 추정이다. Codex는 `turn.completed`가 turn의 모든 호출을 더한 값이라 context 원을 그리지 않는다. Kiro는 보고하는 비율(%)만 그린다.
- bot이 `start_task`가 알려 준 worktree 경로에서 실제로 일하고 커밋하는지, OpenAI bot이 MCP server 도구와 `read_skill`을 쓰는지. 테스트는 가짜 SDK로 돈다.
- MCP server 시작은 실제 서버로 돌려 보지 않았다. 테스트는 세션 옵션과 turn 요청에 들어가는지만 본다.
