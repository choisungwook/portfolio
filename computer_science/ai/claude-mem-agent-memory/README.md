# claude-mem 원리 핸즈온: 코딩 에이전트에게 세션 간 메모리 붙이기

코딩 에이전트는 세션이 끝나면 한 일을 모두 잊습니다. [claude-mem](https://github.com/thedotmack/claude-mem)은 hook으로 도구 호출을 모으고, 별도 observer 에이전트가 그것을 짧은 관찰로 압축해 SQLite에 저장한 뒤, 다음 세션 시작 때 인덱스만 주입합니다. 이 핸즈온은 그 구조를 Python 약 600줄(`minimem`)로 다시 만들고, 실제 Claude Code 세션 두 개로 메모리가 있을 때와 없을 때를 비교합니다.

| 세션 B 질문: "지난 세션에서 무슨 작업을 했지?" | 메모리 없음 | minimem |
| --- | --- | --- |
| 답변 | 기록이 없어 답하지 못함 | 버그 원인, 금액 규칙, 다음 할 일을 답함 |
| 도구 호출 | 4회 | 0회 |
| 입력 토큰 | 100,592 | 19,880 |
| 소요 시간 | 12.5초 | 3.3초 |

## 문서

1. [기능 지도와 최종 목표: 인수인계 노트를 남기는 동료](docs/1-memory-map.md)
2. [캡처: lifecycle hook으로 도구 호출을 모은다](docs/2-capture-hooks.md)
3. [압축: observer 에이전트가 원본을 관찰로 바꾼다](docs/3-observer.md)
4. [저장과 검색: SQLite FTS5와 한국어 토크나이저](docs/4-storage-search.md)
5. [주입: SessionStart hook이 인덱스를 컨텍스트에 넣는다](docs/5-context-injection.md)
6. [필요할 때 본문 조회: MCP 검색과 progressive disclosure](docs/6-mcp-search.md)
7. [claude-mem 원본과 비교: minimem이 생략한 것](docs/7-claude-mem-comparison.md)

- 환경 준비: [setup.md](docs/setup.md)
- 문제 해결: [troubleshooting.md](docs/troubleshooting.md)

## 코드 디렉터리

| 디렉터리 | 내용 |
| --- | --- |
| [minimem/](minimem/) | hook, observer, SQLite 저장소, 컨텍스트 생성, MCP 서버 |
| [lab-template/](lab-template/) | 실습용 `shop` 프로젝트와 hook·MCP 설정 원본 |
| [scripts/](scripts/) | 세션 실행·지표 수집(`run_session.py`), 토크나이저 비교(`tokenizer_compare.py`) |

## 검증 상태

- `make test` 단위 테스트 8개 통과, ruff 검사 통과
- 시나리오 1~6의 Claude Code 세션(`claude -p`, sonnet, observer는 haiku)을 실제로 실행하고 출력과 수치를 문서에 옮겼습니다.
- 시나리오 7의 claude-mem 원본은 v16.0.0 소스를 읽고 비교했습니다. 원본 설치와 실행은 검증하지 않았습니다.
