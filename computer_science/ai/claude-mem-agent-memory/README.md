# claude-mem 원리 핸즈온: 코딩 에이전트에게 세션 간 메모리 붙이기

코딩 에이전트와 함께 작업하다 보면 세션이 새로 열릴 때마다 맥락이 초기화되는 불편함을 자주 겪게 됩니다. 방금 전 세션에서 잡은 버그 원인이나 프로젝트 규칙, 다음으로 이어서 해야 할 작업까지 매번 다시 설명해야 하죠. [claude-mem](https://github.com/thedotmack/claude-mem)은 이 문제를 꽤 영리한 구조로 풀어냅니다. Claude Code의 lifecycle hook으로 도구 호출을 빠짐없이 수집하고, 별도의 observer 에이전트가 이를 짧은 관찰(observation) 기록으로 압축해 SQLite에 저장한 뒤, 다음 세션이 시작될 때 핵심 인덱스만 컨텍스트에 주입하는 방식입니다.

이 핸즈온에서는 claude-mem의 핵심 원리를 Python 약 600줄 규모의 축소판(`minimem`)으로 직접 구현해 보고, 실제 Claude Code 세션 두 개를 실행해 메모리가 있을 때와 없을 때의 차이를 수치로 비교합니다.

같은 질문("지난 세션에서 무슨 작업을 했지?")을 새 세션(세션 B)에 던졌을 때의 측정 결과는 다음과 같습니다.

| 세션 B 비교 항목 | 메모리 없음 | minimem 적용 |
| --- | --- | --- |
| 답변 내용 | 지난 기록을 찾지 못해 답하지 못함 | 버그 원인, 금액 타입 규칙, 다음 할 일까지 정확히 답변 |
| 도구 호출 횟수 | 4회 | 0회 |
| 입력 토큰 (캐시 포함) | 100,592 | 19,880 |
| 소요 시간 | 12.5초 | 3.3초 |

## 문서 목록

시나리오 순서대로 따라가면 에이전트 메모리의 캡처부터 압축, 저장·검색, 컨텍스트 주입, 온디맨드 본문 조회, 그리고 원본 claude-mem과의 설계 차이까지 자연스럽게 이해할 수 있습니다.

1. [기능 지도와 최종 목표: 인수인계 노트를 남기는 동료](docs/1-memory-map.md)
2. [캡처: lifecycle hook으로 도구 호출 모으기](docs/2-capture-hooks.md)
3. [압축: observer 에이전트가 원본을 관찰로 바꾸는 과정](docs/3-observer.md)
4. [저장과 검색: SQLite FTS5와 한국어 토크나이저](docs/4-storage-search.md)
5. [주입: SessionStart hook으로 컨텍스트에 인덱스 넣기](docs/5-context-injection.md)
6. [필요할 때만 본문 조회: MCP 검색과 progressive disclosure](docs/6-mcp-search.md)
7. [claude-mem 원본과 비교: minimem이 덜어낸 운영 장치들](docs/7-claude-mem-comparison.md)

실습을 시작하기 전 환경 구성과 자주 겪는 문제 해결 방법은 아래 문서를 참고하세요.

- 환경 준비: [setup.md](docs/setup.md)
- 문제 해결: [troubleshooting.md](docs/troubleshooting.md)

## 코드 구성

핸즈온 저장소는 크게 세 디렉터리로 나뉘어 있습니다.

| 디렉터리 | 역할 |
| --- | --- |
| [minimem/](minimem/) | hook 처리, observer 호출, SQLite 저장소, 컨텍스트 빌더, MCP 서버 구현 |
| [lab-template/](lab-template/) | 실습용 `shop` 프로젝트와 hook·MCP 설정 원본 템플릿 |
| [scripts/](scripts/) | 세션 실행 및 지표 수집(`run_session.py`), 토크나이저 비교(`tokenizer_compare.py`) 등 측정 스크립트 |

## 검증 상태

- `make test` 기준 단위 테스트 8개 통과, `ruff` 정적 검사 통과
- 시나리오 1~6의 모든 실습은 실제 Claude Code 세션(`claude -p`, 메인 에이전트 `sonnet`, observer `haiku`)을 실행해 얻은 출력과 수치를 그대로 담았습니다.
- 시나리오 7의 claude-mem 원본 비교는 v16.0.0 소스를 직접 읽고 정리한 내용이며, 원본 설치와 실행은 별도로 검증하지 않았습니다.
