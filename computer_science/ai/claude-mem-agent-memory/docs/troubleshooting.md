# 문제 해결

실습을 만들며 겪은 문제를 증상과 해결 방법으로 정리했습니다.

## 실습 세션이 저장소의 작업 규칙을 따른다

- 증상: 세션 A가 버그를 고치지 않고 "`git pull origin master --rebase`를 하지 못했다", "규칙 파일을 읽지 못했다"고 답합니다.
- 원인: Claude Code는 작업 디렉터리의 상위 디렉터리에 있는 `CLAUDE.md`를 읽습니다. 실습 프로젝트를 이 저장소 안에 두면 저장소 규칙이 실습 세션에 들어갑니다.
- 해결: `make up`은 실습 프로젝트를 저장소 밖 `~/minimem-workspace/shop`에 만듭니다. 다른 위치를 쓰려면 `make up LAB_DIR=<경로>`로 저장소 밖 경로를 지정하고, 이후 시나리오 명령의 `~/minimem-workspace` 경로와 `make down`에도 같은 `LAB_DIR`을 씁니다.

## 세션에서 minimem MCP 도구가 보이지 않는다

- 증상: 에이전트가 "`minimem` 서버가 `CONNECTION_CLOSED`로 연결되지 않았다"고 답합니다.
- 원인: 서버 프로세스가 import 단계에서 종료됐습니다. `mcp` 1.21.0은 최신 `pydantic`과 맞지 않아 `ImportError: cannot import name 'eval_type_backport'`가 발생하고, `mcp` 2.x는 `mcp.server.fastmcp.FastMCP`를 `mcp.server.mcpserver.MCPServer`로 바꿨습니다.
- 해결: `pyproject.toml`에 `mcp==2.3.0`을 고정하고 `MCPServer`를 씁니다. 서버만 따로 실행해 확인할 때는 initialize 요청을 stdin으로 넣습니다.

```bash
cd ~/minimem-workspace/shop
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | uv run --quiet --project <minimem 경로> minimem-mcp
```

응답 JSON에 `"serverInfo":{"name":"minimem"`이 있으면 서버가 정상입니다.

## `claude -p`에서 테스트 실행이 승인 대기로 멈춘다

- 증상: 세션 답변에 "테스트 실행 명령이 승인 대기 상태로 막혀서"가 나오고, stream-json의 `permission_denials`에 `Bash`가 남습니다.
- 원인: 이 핸즈온을 만든 환경(Claude Code 2.1.327)에서는 실습 프로젝트 `.claude/settings.json`의 `permissions.allow`가 `-p` 실행에 적용되지 않았습니다. 원인은 확인하지 못했습니다.
- 해결: `run_session.py`는 `--allowedTools`로 허용 도구를 직접 넘깁니다. 같은 규칙을 `--allowedTools "Bash(python *)"`로 넘기자 승인 없이 실행됐습니다.

## 메모리 없는 기준선 세션이 지난 대화를 찾아 읽는다

- 증상: `--no-memory` 세션 B가 `~/.claude/projects/<프로젝트>/`의 jsonl 파일을 찾아 읽으려 합니다.
- 원인: Claude Code는 세션 transcript를 `~/.claude/projects/` 아래에 저장하고, 에이전트는 이것을 기록으로 찾아 씁니다. 메모리 유무 비교가 흐려집니다.
- 해결: `run_session.py`는 `--no-session-persistence`로 transcript 저장을 끕니다.

## observer 요약에 실습과 상관없는 지시가 들어간다

- 증상: 세션 요약의 "다음 할 일"에 commit 메시지 형식처럼 사용자 요청에 없던 내용이 들어갑니다.
- 원인: observer도 Claude Code 세션이라 사용자 설정과 실행 환경이 주입하는 지시를 받습니다. 원격 실행 환경에서 Claude Code를 쓰면 환경 변수로 지시가 추가될 수 있습니다.
- 해결: observer는 `--setting-sources=`, `--strict-mcp-config`, `--tools=`, `--system-prompt`로 실행합니다([시나리오 3](3-observer.md)). 원격 실행 환경에서는 실습 명령 앞에서 `CLAUDE_CODE_`로 시작하는 환경 변수를 지운 뒤 측정했습니다.

## 메모리가 쌓인 뒤 에이전트가 지난 기록을 모른다

- 증상: `run_session.py`의 `injected_context_chars`가 10,000을 넘은 뒤 에이전트가 주입된 요약 내용을 답하지 못합니다.
- 원인: Claude Code는 hook 출력이 10,000자를 넘으면 파일로 저장하고 앞부분 약 2KB 미리보기만 모델에 넣습니다. hook은 성공으로 보고됩니다.
- 해결: `build_context()`는 9,000자를 넘는 동안 오래된 관찰을 뺍니다. 한도 확인은 `uv run scripts/context_limit.py`로 합니다([시나리오 5](5-context-injection.md)).

## 메모리를 조회만 한 세션 뒤에 다음 할 일이 사라진다

- 증상: 검색 도구만 쓴 세션 뒤 "지난 세션 요약"이 "사용자가 메모리 검색을 요청함"으로 바뀝니다.
- 원인: `mcp__minimem__*` 호출이 이벤트로 저장되고, observer가 그 세션의 요약을 만들어 직전 요약을 대체했습니다.
- 해결: `hook.should_skip()`이 메모리 도구와 `ToolSearch`를 캡처에서 뺍니다([시나리오 6](6-mcp-search.md)).

## 검색 결과가 0건이다

- 증상: `mcp__minimem__search`가 "검색 결과 없음"을 돌려주는데, 관련 관찰은 인덱스에 있습니다.
- 원인: 검색어 단어를 모두 포함해야 하는 AND 검색이었거나, 2글자 한국어 단어를 `trigram`으로만 찾았습니다.
- 해결: minimem 기본값은 OR 검색이고, 3글자 미만 단어는 `LIKE`로 찾습니다. `minimem search shop "<검색어>" --mode and`로 차이를 확인합니다([시나리오 4](4-storage-search.md)).
