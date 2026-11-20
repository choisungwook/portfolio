# 실습 환경 준비

## 사전 요구사항

| 항목 | 확인 명령 | 비고 |
| --- | --- | --- |
| Claude Code CLI | `claude --version` | 실제 모델 호출을 하려면 로그인합니다 |
| uv | `uv --version` | minimem 의존성 설치에 사용합니다 |
| Python 3.11 이상 | `python3 --version` | 세션 실행 스크립트에 사용합니다 |
| SQLite CLI (선택) | `sqlite3 --version` | 시나리오 2에서 원본 이벤트를 직접 조회할 때 사용합니다 |

## 실습 프로젝트 생성

아래 명령은 저장소 바깥에 새 실습 폴더와 메모리 경로를 만듭니다. 실습 프로젝트를 분리하면 상위 저장소의 Claude 규칙이 세션에 섞이는 것을 피할 수 있습니다. 다음 장도 같은 터미널에서 진행하세요.

이전 할인 실습의 `LAB_DIR`에는 `shop`만 있습니다. 놀이공원 실습으로 넘어갈 때도 아래 블록 전체를 실행해 새 경로를 지정하세요.

```bash
cd computer_science/ai/claude-mem-agent-memory
LAB_ROOT="$(mktemp -d /tmp/minimem-park.XXXXXX)"
export LAB_DIR="$LAB_ROOT/workspace"
export MINIMEM_HOME="$LAB_ROOT/memory"
make up
```

`make up`은 uv로 minimem을 설치하고 설정 템플릿을 `$LAB_DIR/park`에 복사합니다. Claude Code hook과 MCP는 설치된 실행 파일을 직접 호출합니다. 실습 도중에는 Claude Code를 시작할 때마다 uv가 의존성을 다시 확인할 필요가 없습니다.

등록된 네 hook은 아래에서 확인합니다.

```bash
python3 -c 'import json, sys; print(*json.load(open(sys.argv[1]))["hooks"])' "$LAB_DIR/park/.claude/settings.json"
```

## 메모리 DB 위치와 조회 방법

메모리는 `$MINIMEM_HOME/memory.db`에 저장합니다. minimem은 작업 디렉터리 이름인 `park`를 프로젝트 키로 씁니다.

아래 명령은 현재 프로젝트에 쌓인 이벤트, 관찰, 주입 컨텍스트의 크기를 출력합니다.

```bash
minimem/.venv/bin/minimem stats park
```

## 환경 정리

실습을 모두 마쳤다면, 위에서 지정한 작업 디렉터리와 메모리 DB를 삭제합니다.

```bash
make down
```
