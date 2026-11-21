# claude-mem 원리 핸즈온

놀이공원 방문객은 오늘 137명입니다. 숫자만 파일에 남기고, 직원 제외 기준과 최종 확정 시각은 대화로만 알려 줍니다. 새 세션이 그 기준까지 어떻게 알 수 있는지 비교하면서 [claude-mem](https://github.com/thedotmack/claude-mem)의 세션 간 메모리 원리를 확인합니다.

[환경을 준비한 뒤](docs/setup.md) [방문객 집계 실습](docs/1-memory-map.md)을 진행하세요. Claude Code 세션 세 개와 백그라운드 observer 호출 한 번을 사용합니다. 이어지는 장은 같은 SQLite 기록을 살펴봅니다.

## 실습 순서

1. [놀이공원 방문객 기억하기](docs/1-memory-map.md)
2. [캡처: hook이 파일 작업을 기록하는 과정](docs/2-capture-hooks.md)
3. [압축: observer가 관찰과 요약을 만드는 과정](docs/3-observer.md)
4. [저장과 검색: SQLite FTS5와 한국어 검색](docs/4-storage-search.md)
5. [주입: 다음 세션이 처음에 받는 내용](docs/5-context-injection.md)
6. [MCP로 필요한 관찰 본문 꺼내기](docs/6-mcp-search.md)
7. [claude-mem 원본과 비교](docs/7-claude-mem-comparison.md)

[문제 해결](docs/troubleshooting.md)

## 코드 구성

| 디렉터리 | 역할 |
| --- | --- |
| [minimem/](minimem/) | hook, observer, SQLite, 컨텍스트 생성, MCP 서버 |
| [lab-template/](lab-template/) | 실습 프로젝트의 Claude Code hook 및 MCP 설정 |
| [scripts/](scripts/) | 세션 실행 및 지표 수집, hook 실행 시간과 한국어 검색 비교 |
