# 문제 해결

이 핸즈온을 구성하고 실행하면서 실제로 부딪혔던 문제들을 증상, 원인, 해결 방법 순으로 정리했습니다. 비슷한 상황을 만나면 아래 항목에서 원인을 바로 찾아볼 수 있습니다.

## 실습 세션이 저장소의 작업 규칙을 따르는 문제

- **증상**: 세션 A가 방문객 숫자를 기록하는 대신 "`git pull origin master --rebase`를 하지 못했다", "규칙 파일을 읽지 못했다" 같은 엉뚱한 답을 내놓습니다.
- **원인**: Claude Code는 실행 경로의 상위 디렉터리를 거슬러 올라가며 `CLAUDE.md`를 자동으로 읽습니다. 실습 프로젝트를 이 저장소 안쪽에 두면 저장소 루트의 규칙이 실습 세션에 그대로 주입됩니다.
- **해결**: [환경 준비](setup.md)대로 저장소 밖의 경로를 `LAB_DIR`로 지정하고 `make up`을 실행합니다.

## Claude Code 응답이 오래 걸리는 경우

`duration_s`는 Claude Code가 보고한 세션 시간이고, `wall_s`는 실행기 시작부터 결과까지 재는 시간입니다. Haiku를 사용해도 CLI 시작, 도구 실행, 네트워크 대기, observer 응답에 걸리는 시간은 달라집니다.

`Not logged in`이 나오면 같은 터미널에서 Claude Code 로그인을 확인합니다. 세션 스크립트가 60초 응답 제한에 도달했으면 나눠 실행한 세 단계 중 어디에서 걸렸는지 확인합니다.

## observer가 관찰을 저장하지 못하는 경우

방문객 숫자 파일을 썼다면 아래에서 `Write` 이벤트가 저장됐는지 확인합니다. observer가 이미 끝났는데도 `processed=0`이라면 세션 A의 `session_id`로 다시 실행해 오류를 확인할 수 있습니다.

```bash
minimem/.venv/bin/minimem events park
minimem/.venv/bin/minimem observe "<세션 A의 session_id>"
```

## MCP 도구가 보이지 않는 경우

기본 실습은 `--no-mcp`로 MCP 연결을 건너뜁니다. [MCP 선택 실험](6-mcp-search.md)에서는 이 옵션을 빼고, `make up`이 만든 `.mcp.json`의 실행 파일이 존재하는지 확인합니다.

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
- **해결**: `build_context()`가 출력 길이를 9,000자 이하로 유지하도록 오래된 관찰부터 하나씩 제외합니다. 현재 환경의 실제 한도는 `minimem/.venv/bin/python scripts/context_limit.py`로 직접 확인할 수 있습니다([시나리오 5](5-context-injection.md)).

## 메모리를 조회만 한 세션 뒤에 다음 할 일이 사라지는 문제

- **증상**: 검색 도구만 호출하고 끝난 세션 이후, "지난 세션 요약"이 "사용자가 메모리 검색을 요청함"으로 덮어씌워집니다.
- **원인**: `mcp__minimem__*` 호출이 일반 도구 사용처럼 `PostToolUse` 이벤트로 저장되면서, observer가 이를 새 작업 세션으로 판단해 직전 요약을 교체해 버린 것입니다.
- **해결**: `hook.should_skip()`에서 `mcp__minimem__*`와 `ToolSearch` 호출을 캡처 대상에서 제외했습니다([시나리오 6](6-mcp-search.md)).

## 검색 결과가 0건으로 나오는 문제

- **증상**: 관련 관찰이 인덱스에 분명히 보이는데도 `mcp__minimem__search`가 "검색 결과 없음"을 돌려줍니다.
- **원인**: 검색어의 모든 단어가 한 관찰 안에 동시에 들어 있어야 하는 AND 검색으로 동작했거나, 2글자 한국어 단어를 3글자 단위인 `trigram` 토크나이저로만 조회했기 때문입니다.
- **해결**: `minimem`은 기본 검색 방식을 OR로 두고, 3글자 미만 단어는 `LIKE`로 보완합니다. 두 방식은 [검색 실습](4-storage-search.md)의 명령으로 비교할 수 있습니다.

## uv가 오래된 Python 경로를 읽는 경우

이 저장소의 상위 폴더에 오래된 `.python-version`이 있다면 `uv run scripts/…`가 존재하지 않는 Python을 찾을 수 있습니다. 실습 스크립트는 `make up`이 준비한 `minimem/.venv/bin/python`으로 실행합니다.
