# akbun-makepresentation: 빈 창 제자리 열기, 텍스트 자동 높이, 아이콘 칩, 전체 폰트 변경

- Issue: 미생성 (repo-pr-ship에서 생성)
- Branch: claude/ppt-presentation-features-y7zmjc

## 실행 계획

- [x] 1. 파일 열기: 문서가 없는 창은 제자리에서 열기 (Rust adopt_document, Finder Opened 이벤트 포함)
- [x] 2. 텍스트 상자 자동 높이 (리사이즈·파일 열기)
- [x] 3. AI 이미지 모드 아이콘 생성 칩과 시스템 프롬프트
- [x] 4. Slides 메뉴에서 전체 슬라이드 폰트 변경
- [x] 5. 테스트, 버전 0.27.0, README·wiki·knowledge 갱신
- [ ] 6. repo-pr-ship 실행

## 다음 세션이 알아야 할 것

- Finder 더블클릭은 macOS RunEvent::Opened로 오고 argv에 경로가 없음. 그래서 빈 프로세스가 두 번째 프로세스를 띄워 창이 2개였음
