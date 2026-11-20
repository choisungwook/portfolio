# 실습 환경 준비

## 필요한 것

| 항목 | 확인 명령 | 비고 |
| --- | --- | --- |
| Claude Code CLI | `claude --version` | 로그인된 상태여야 `claude -p`가 동작합니다 |
| uv | `uv --version` | minimem 의존성(`mcp`)과 스크립트 실행 |
| Python 3.11 이상 | `python3 --version` | SQLite FTS5 `trigram` 토크나이저는 SQLite 3.34 이상에 있습니다 |

실습 세션은 Claude Code를 실제로 호출하므로 사용량이 발생합니다. 시나리오 1의 세션 4개와 observer 호출 기준으로 입력 토큰 약 30만 개를 사용했습니다(대부분 캐시 읽기).

## 실습 환경 생성

`make up`은 minimem 의존성을 설치하고, `lab-template/`을 `~/minimem-workspace/shop`으로 복사한 뒤 hook과 MCP 설정의 `__MINIMEM__` 자리를 minimem의 절대 경로로 바꿉니다.

```bash
cd computer_science/ai/claude-mem-agent-memory
make up
```

실습 프로젝트를 이 저장소 밖에 두는 이유는 Claude Code가 상위 디렉터리의 `CLAUDE.md`를 읽기 때문입니다. 저장소 안에서 실습하면 저장소의 작업 규칙이 실습 세션에 섞여 결과가 달라집니다.

생성된 hook 설정은 다음 명령으로 확인합니다. `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop` 4개 이벤트가 `minimem-hook`을 호출해야 합니다.

```bash
python3 -c "import json,os;print(list(json.load(open(os.path.expanduser('~/minimem-workspace/shop/.claude/settings.json')))['hooks']))"
```

```text
['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']
```

## 메모리 DB 위치

minimem은 `MINIMEM_HOME`(기본 `~/.minimem`) 아래 `memory.db` 하나에 모든 프로젝트의 기록을 저장합니다. 프로젝트는 작업 디렉터리 이름(`shop`)으로 구분합니다. DB를 들여다볼 때는 `minimem` CLI를 씁니다.

```bash
uv run --project minimem minimem stats shop
```

## 정리

`make down`은 `~/minimem-workspace`와 `~/.minimem`을 지웁니다. 실습 프로젝트는 그대로 두고 메모리만 비우려면 `make reset-memory`를 씁니다.

```bash
make down
```
