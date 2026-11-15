# AI 도구는 브라우저를 어떻게 조작하는가: CDP 원리와 Playwright 비교

Claude desktop의 내장 브라우저, Claude in Chrome(Claude CLI `--chrome`), Codex의 Chrome 연동, Aside 같은 AI 브라우저는 모두 Chrome DevTools Protocol(CDP)을 통해 브라우저 엔진에 명령을 전달합니다. 제품마다 차이가 나는 지점은 CDP 메시지 자체가 아니라, 이를 브라우저까지 전달하는 전송 경로(transport)입니다. 이 핸즈온은 raw CDP로 AI 브라우저 tool의 핵심 동작을 재현하고, 로컬에 설치된 제품 파일에서 각 전송 경로를 검증하며, 동일한 작업을 Playwright로 실행해 CDP와의 차이를 명령 수 기준으로 비교합니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](docs/setup.md) | 실습용 Chrome(9222)과 테스트 페이지(8000) 기동 및 종료 |
| 1 | [1-cdp-principle.md](docs/1-cdp-principle.md) | 기능 지도, CDP 구조, Chrome 136 보안 정책 변경, raw CDP 8개 명령으로 이동·클릭·읽기·캡처 |
| 2 | [2-ai-tool-access-paths.md](docs/2-ai-tool-access-paths.md) | `webContents.debugger`, `chrome.debugger` + Native Messaging, Aside의 Playwright 스타일 래퍼 |
| 3 | [3-playwright-vs-cdp.md](docs/3-playwright-vs-cdp.md) | `connect_over_cdp`, 동일 작업의 CDP 명령 36개 비교, 단일 클릭 동작 분해 |
| 4 | [4-blog-upload-scenario.md](docs/4-blog-upload-scenario.md) | (이론) 블로그 편집기 업로드 원리, OS 파일 선택창을 우회하는 CDP 가로채기·`File` 생성·drop 세 가지 방식 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 발생하는 주요 오류와 해결 방법 |

## 코드

| 경로 | 설명 |
|---|---|
| `site/index.html` | 클릭 시 `count`가 증가하는 테스트 페이지 |
| `cdp-raw/cdp_raw.py` | WebSocket으로 raw CDP 명령을 전송하는 클라이언트 |
| `playwright/pw_over_cdp.py` | 동일 작업을 Playwright `connect_over_cdp`로 수행하는 스크립트 |
