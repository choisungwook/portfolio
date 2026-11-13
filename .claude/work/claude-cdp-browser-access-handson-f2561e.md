# CDP로 AI 도구가 브라우저를 제어하는 원리 핸즈온

- Issue: (PR 생성 시 작성)
- Branch: claude/cdp-browser-access-handson-f2561e

## 실행 계획

- [x] 1. README 인덱스에서 기존 핸즈온 확인 — 없음
- [x] 2. 원리 조사(Claude desktop, Claude in Chrome, Codex, Aside, Playwright)
- [x] 3. 실습 코드(raw CDP, Playwright over CDP, 로컬 테스트 페이지)
- [x] 4. 시나리오 문서 3개와 setup
- [x] 5. 실제 실행 후 출력 반영
- [x] 6. mermaid 렌더링 검사
- [x] 7. knowledge, troubleshooting, 루트 README 목차

## 다음 세션이 알아야 할 것

- 로컬 증거: Claude in Chrome과 ChatGPT for Chrome 확장 모두 manifest에 debugger와 nativeMessaging 권한이 있다
- Claude.app app.asar에 WebContentsView와 webContents.debugger.sendCommand 호출이 있다
