# AI 도구는 브라우저를 어떻게 조작하는가: CDP 원리와 Playwright 비교

Claude desktop의 내장 브라우저, Claude in Chrome(Claude CLI `--chrome`), Codex의 Chrome 연동, Aside 같은 AI 브라우저는 모두 Chrome DevTools Protocol(CDP)로 브라우저 엔진에 명령을 보냅니다. 제품마다 다른 것은 CDP 메시지를 브라우저까지 전달하는 통로입니다. 이 핸즈온은 raw CDP로 AI 브라우저 tool의 동작을 재현하고, 설치된 제품 파일에서 각 통로를 확인하고, 같은 작업을 Playwright로 실행해 CDP와의 차이를 명령 수로 비교합니다.

## 문서

| 순서 | 문서 | 내용 |
|---|---|---|
| 0 | [setup.md](docs/setup.md) | 실습용 Chrome(9222)과 테스트 페이지(8000) 올리기·내리기 |
| 1 | [1-cdp-principle.md](docs/1-cdp-principle.md) | 기능 지도, CDP의 구조, Chrome 136 보안 변경, raw CDP 8개 명령으로 이동·클릭·읽기·캡처 |
| 2 | [2-ai-tool-access-paths.md](docs/2-ai-tool-access-paths.md) | `webContents.debugger`, `chrome.debugger` + Native Messaging, Aside의 Playwright 스타일 래퍼 |
| 3 | [3-playwright-vs-cdp.md](docs/3-playwright-vs-cdp.md) | `connect_over_cdp`, 같은 작업의 CDP 명령 36개, 클릭 한 번의 분해 |
| 4 | [4-blog-upload-scenario.md](docs/4-blog-upload-scenario.md) | (이론) 블로그 편집기에 글과 사진을 넣는 원리, OS 파일 선택창을 우회하는 CDP 가로채기·`File` 생성·drop 세 방법 |
| - | [troubleshooting.md](docs/troubleshooting.md) | 실습 중 겪은 문제 |

## 코드

| 경로 | 설명 |
|---|---|
| `site/index.html` | 클릭하면 count가 올라가는 테스트 페이지 |
| `cdp-raw/cdp_raw.py` | WebSocket으로 raw CDP 명령을 보내는 클라이언트 |
| `playwright/pw_over_cdp.py` | 같은 작업을 Playwright `connect_over_cdp`로 수행 |
