# 실습 환경 준비

이 문서에서는 시나리오 1~6을 직접 실행하기 위한 사전 요구사항과 실습 프로젝트 생성·정리 방법을 다룹니다.

## 사전 요구사항

실습을 진행하려면 아래 세 가지 도구가 준비되어 있어야 합니다.

| 항목 | 확인 명령 | 비고 |
| --- | --- | --- |
| Claude Code CLI | `claude --version` | 로그인된 상태여야 `claude -p` 비대화형 실행이 동작합니다 |
| uv | `uv --version` | `minimem` 의존성(`mcp`) 설치와 스크립트 실행에 사용합니다 |
| Python 3.11 이상 | `python3 --version` | SQLite FTS5 `trigram` 토크나이저는 SQLite 3.34 이상부터 지원합니다 |

실습 과정에서는 실제 Claude Code 세션을 호출하므로 토큰 사용량이 발생합니다. 시나리오 1의 세션 4개와 observer 호출을 모두 돌렸을 때 기준으로 입력 토큰 약 30만 개가 소모되었으며, 대부분은 프롬프트 캐시 읽기였습니다.

## 실습 프로젝트 생성

`make up`을 실행하면 `minimem` 의존성을 설치한 뒤, `lab-template/`을 `~/minimem-workspace/shop` 경로로 복사하고 hook·MCP 설정 파일 안의 `__MINIMEM__` 자리표시자를 현재 `minimem` 디렉터리의 절대 경로로 치환합니다.

아래 명령으로 실습 환경을 만듭니다.

```bash
cd computer_science/ai/claude-mem-agent-memory
make up
```

실습 프로젝트를 굳이 이 저장소 바깥(`~/minimem-workspace/shop`)에 두는 데는 이유가 있습니다. Claude Code는 현재 작업 디렉터리뿐만 아니라 상위 디렉터리의 `CLAUDE.md`까지 탐색해 프롬프트에 포함하기 때문입니다. 만약 저장소 내부에서 실습을 돌리면 이 저장소의 작업 규칙이 실습 세션에 섞여 들어가 실험 결과가 달라집니다.

환경 생성이 끝났다면 아래 명령으로 `shop` 프로젝트에 hook 설정이 제대로 들어갔는지 확인합니다.

```bash
python3 -c "import json,os;print(list(json.load(open(os.path.expanduser('~/minimem-workspace/shop/.claude/settings.json')))['hooks']))"
```

정상적으로 설정되었다면 `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop` 네 가지 lifecycle 이벤트가 출력됩니다.

```text
['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop']
```

## 메모리 DB 위치와 조회 방법

`minimem`은 `MINIMEM_HOME`(기본값 `~/.minimem`) 디렉터리 아래 `memory.db` 파일 하나에 모든 프로젝트의 기록을 모아 저장합니다. 프로젝트는 작업 디렉터리 이름(`shop`)으로 구분하며, 저장된 상태는 `minimem` CLI로 바로 확인할 수 있습니다.

아래 명령으로 `shop` 프로젝트의 현재 메모리 통계를 조회합니다.

```bash
uv run --project minimem minimem stats shop
```

## 환경 정리

실습이 끝난 뒤 작업 디렉터리와 메모리 DB를 모두 정리하려면 `make down`을 실행합니다. 이 명령은 `~/minimem-workspace`와 `~/.minimem`을 함께 삭제합니다. 만약 `shop` 프로젝트 파일은 그대로 두고 메모리 기록만 초기화하고 싶다면 `make reset-memory`를 사용하면 됩니다.

```bash
make down
```
