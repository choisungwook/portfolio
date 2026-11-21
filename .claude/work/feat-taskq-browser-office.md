# taskq bot이 브라우저와 csv·엑셀·파워포인트를 다루게 하기

- Branch: feat/taskq-browser-office

## 실행 계획

- [x] 1. TeamTool handler가 Promise를 돌려도 되게 (claude call, openai teamTool, mcp server)
- [x] 2. src/browser/: bot마다 headless Chrome(user-data-dir TASKQ_HOME/browser/<bot>), DevToolsActivePort로 어느 프로세스든 붙음, CDP over WebSocket
- [x] 3. bot 도구 browser_open, browser_read, browser_click, browser_type, browser_screenshot
- [x] 4. API GET /bots/:name/browser(상태), GET .../browser/screen(png), POST .../browser/open; 오른쪽 브라우저 창이 bot 화면을 1초마다 보임
- [x] 5. office 도구: csv_read/csv_write, xlsx_read/xlsx_write/xlsx_set_cells(exceljs), pptx_read/pptx_replace_text(jszip), pptx_create(pptxgenjs). 상대 경로는 공용 폴더
- [x] 6. 테스트(CDP는 Chrome 없으면 skip), wiki/architecture.md 도구 목록, features.md, changelog/0.29.0, 버전 0.29.0
- [ ] 7. 리뷰 1회, 상태 파일 삭제, PR, 스쿼시 머지

## 다음 세션이 알아야 할 것

- Kiro bot은 `taskq mcp --bot` 별도 프로세스라 DevToolsActivePort 파일로 같은 Chrome에 붙어야 서버 화면과 같은 브라우저를 본다
