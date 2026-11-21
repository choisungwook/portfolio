# akbun-taskq 0.29.0

## Added

- bot이 자기 브라우저를 조종한다. taskq가 이 Mac의 Chrome(또는 Chromium, Edge, Brave)을 bot마다 headless로 띄우고, bot은 `browser_open`, `browser_read`, `browser_click`, `browser_type`, `browser_screenshot`로 페이지를 열고 읽고 누르고 입력하고 찍는다. 쿠키는 bot마다 `TASKQ_HOME/browser/<bot>`에 남는다.
- 대화 오른쪽 브라우저 창이 그 bot의 브라우저 화면을 1초마다 보인다. 주소창으로 같은 브라우저에서 페이지를 열고, 화면을 누르면 그 자리가 눌린다.
- bot이 CSV, Excel, PowerPoint 파일을 다룬다: `csv_read`, `csv_write`, `xlsx_read`, `xlsx_write`, `xlsx_set_cells`, `pptx_read`, `pptx_replace_text`, `pptx_add_slide`, `pptx_create`. 사용자가 경로를 준 파일은 그 파일을 계속 고치고, 아니면 공용 폴더에 새 파일을 만든다. 기존 Excel과 PowerPoint는 서식과 디자인을 지키며 고친다.
- `GET /api/bots/:name/browser`, `GET /api/bots/:name/browser/screen`, `POST /api/bots/:name/browser/open`, `POST /api/bots/:name/browser/click`.

## Changed

- 브라우저 창은 더 이상 iframe이 아니다. 그래서 UI의 CSP에서 외부 frame 허용을 없애고, 화면 그림을 위한 `blob:` 이미지만 허용한다.
- 의존성 exceljs, jszip, pptxgenjs를 추가했다.

## SDK

변경 없음. 새 도구는 다른 team 도구처럼 Claude에는 in-process MCP server로, OpenAI에는 function tool로, Kiro에는 `taskq mcp --bot`으로 간다.
