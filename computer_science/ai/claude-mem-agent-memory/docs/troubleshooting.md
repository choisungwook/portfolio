# 문제 해결

이 핸즈온을 구성하고 실행하면서 실제로 부딪혔던 문제들을 증상, 원인, 해결 방법 순으로 정리했습니다. 비슷한 상황을 만나면 아래 항목에서 원인을 바로 찾아볼 수 있습니다.

## 실습 세션이 저장소의 작업 규칙을 따르는 문제

- **증상**: 세션 A가 할인 버그를 고치는 대신 "`git pull origin master --rebase`를 하지 못했다", "규칙 파일을 읽지 못했다" 같은 엉뚱한 답을 내놓습니다.
- **원인**: Claude Code는 실행 경로의 상위 디렉터리를 거슬러 올라가며 `CLAUDE.md`를 자동으로 읽습니다. 실습 프로젝트를 이 저장소 안쪽에 두면 저장소 루트의 규칙이 실습 세션에 그대로 주입됩니다.
- **해결**: `make up`은 실습 프로젝트를 저장소 바깥인 `~/minimem-workspace/shop`에 생성합니다. 다른 경로를 쓰고 싶다면 `make up LAB_DIR=<경로>`처럼 저장소 밖의 경로를 지정하고, 이후 시나리오 명령과 `make down`에도 같은 `LAB_DIR`을 넘겨주면 됩니다.

## 세션에서 minimem MCP 도구가 보이지 않는 문제

- **증상**: 에이전트가 "`minimem` 서버가 `CONNECTION_CLOSED`로 연결되지 않았다"고 보고하며 MCP 도구를 쓰지 못합니다.
- **원인**: MCP 서버 프로세스가 실행 직후 import 단계에서 종료된 경우입니다. `mcp` 1.21.0은 최신 `pydantic`과 호환되지 않아 `ImportError: cannot import name 'eval_type_backport'`가 발생하고, `mcp` 2.x부터는 `mcp.server.fastmcp.FastMCP`가 `mcp.server.mcpserver.MCPServer`로 이름이 바뀌었습니다.
- **해결**: `pyproject.toml`에 `mcp==2.3.0`을 고정하고 `MCPServer`를 사용하도록 맞췄습니다. 서버 자체의 정상 동작 여부를 따로 점검하고 싶다면 아래처럼 JSON-RPC `initialize` 요청을 stdin으로 직접 넣어 확인할 수 있습니다.

```bash
cd ~/minimem-workspace/shop
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' \
  | uv run --quiet --project <minimem 경로> minimem-mcp
```

응답 JSON에 `"serverInfo":{"name":"minimem"`이 포함되어 있으면 서버가 정상 기동된 것입니다.

## `claude -p` 실행 중 테스트 명령이 승인 대기로 멈추는 문제

- **증상**: 세션 답변에 "테스트 실행 명령이 승인 대기 상태로 막혔다"는 메시지가 나오고, stream-json 로그의 `permission_denials`에 `Bash`가 기록됩니다.
- **원인**: 핸즈온을 검증한 환경(Claude Code 2.1.327)에서 실습 프로젝트의 `.claude/settings.json`에 적은 `permissions.allow`가 `-p` 비대화형 실행에는 적용되지 않는 현상이 있었습니다. 정확한 내부 원인은 파악하지 못했습니다.
- **해결**: `run_session.py`에서 `--allowedTools` 옵션으로 허용할 도구를 명시적으로 전달하도록 우회했습니다. 같은 규칙을 `--allowedTools "Bash(python *)"` 형태로 넘기면 승인 대기 없이 바로 실행됩니다.

## 메모리 없는 기준선 세션이 지난 대화를 찾아 읽는 문제

- **증상**: `--no-memory`로 실행한 세션 B가 `~/.claude/projects/<프로젝트>/` 아래의 `.jsonl` 파일을 뒤져 이전 대화를 읽어내려 합니다.
- **원인**: Claude Code는 기본적으로 세션 transcript를 `~/.claude/projects/`에 저장합니다. 메모리 유무를 비교하려는 기준선 세션이 이 파일을 찾아 읽으면 실험 조건이 무너집니다.
- **해결**: `run_session.py`에 `--no-session-persistence` 플래그를 추가해 실습 세션의 transcript 저장 자체를 껐습니다.

## observer 요약에 실습과 무관한 지시가 섞이는 문제

- **증상**: 세션 요약의 "다음 할 일" 항목에 commit 메시지 규칙처럼 사용자 프롬프트에 없던 내용이 끼어듭니다.
- **원인**: observer 역시 `claude -p`로 실행되는 Claude Code 세션이기 때문에, 별도로 차단하지 않으면 사용자 전역 설정이나 실행 환경이 주입하는 지시를 그대로 받게 됩니다. 특히 원격 실행 환경에서는 환경 변수로 추가 지시가 들어오는 경우도 있습니다.
- **해결**: observer 호출 시 `--setting-sources=`, `--strict-mcp-config`, `--tools=`, `--system-prompt` 플래그를 모두 붙여 외부 설정을 차단했습니다([시나리오 3](3-observer.md)). 원격 환경에서 측정할 때는 명령 실행 전 `CLAUDE_CODE_`로 시작하는 환경 변수를 비운 뒤 진행했습니다.

## 메모리가 쌓인 뒤 에이전트가 지난 기록을 기억하지 못하는 문제

- **증상**: `run_session.py` 출력의 `injected_context_chars`가 10,000을 넘긴 시점부터 에이전트가 주입된 요약 내용을 답하지 못합니다.
- **원인**: Claude Code는 hook 출력이 10,000자를 초과하면 전체 텍스트를 임시 파일로 빼내고 앞부분 약 2KB 미리보기만 모델 컨텍스트에 넣습니다. 이때 hook 자체는 성공으로 처리되므로 에러 없이 조용히 잘려 나갑니다.
- **해결**: `build_context()`가 출력 길이를 9,000자 이하로 유지하도록 오래된 관찰부터 하나씩 제외합니다. 현재 환경의 실제 한도는 `uv run scripts/context_limit.py`로 직접 확인할 수 있습니다([시나리오 5](5-context-injection.md)).

## 메모리를 조회만 한 세션 뒤에 다음 할 일이 사라지는 문제

- **증상**: 검색 도구만 호출하고 끝난 세션 이후, "지난 세션 요약"이 "사용자가 메모리 검색을 요청함"으로 덮어씌워집니다.
- **원인**: `mcp__minimem__*` 호출이 일반 도구 사용처럼 `PostToolUse` 이벤트로 저장되면서, observer가 이를 새 작업 세션으로 판단해 직전 요약을 교체해 버린 것입니다.
- **해결**: `hook.should_skip()`에서 `mcp__minimem__*`와 `ToolSearch` 호출을 캡처 대상에서 제외했습니다([시나리오 6](6-mcp-search.md)).

## 검색 결과가 0건으로 나오는 문제

- **증상**: 관련 관찰이 인덱스에 분명히 보이는데도 `mcp__minimem__search`가 "검색 결과 없음"을 돌려줍니다.
- **원인**: 검색어의 모든 단어가 한 관찰 안에 동시에 들어 있어야 하는 AND 검색으로 동작했거나, 2글자 한국어 단어를 3글자 단위인 `trigram` 토크나이저로만 조회했기 때문입니다.
- **해결**: `minimem`은 기본 검색 방식을 OR로 두고, 3글자 미만 단어는 `LIKE`로 보완합니다. 두 방식의 차이는 `minimem search shop "<검색어>" --mode and`로 직접 비교해 볼 수 있습니다([시나리오 4](4-storage-search.md)).
