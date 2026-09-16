# akbun-makevideo 로컬 MCP와 복구 지점

- Issue: #1271
- Branch: feat/makevideo-local-mcp

## 실행 계획

- [x] 1. 인터뷰와 기존 편집·파일 경계 조사
- [x] 2. 로컬 MCP 연결과 공통 편집 도구 구현
- [x] 3. 편집 전 영속 복구 지점과 앱 화면 동기화 구현
- [x] 4. 프로토콜·편집·복구·화면 검증 및 실패 수정
- [x] 5. Codex·Claude 연결 가이드와 의사결정 기록
- [x] 6. 사용자 매뉴얼·단독 전달용 AI 매뉴얼과 MCP 편집 범위 정리

## 다음 세션이 알아야 할 것

- Codex와 Claude에 동일한 로컬 MCP 제공, 별도 로그인·인증 없음
- 프로젝트 조회·미디어 가져오기·컷·자막·그래픽·저장·내보내기 포함
- AI가 즉시 편집하고 작업 전 상태를 기억해 롤백 가능해야 함
- 로컬 stdio MCP와 사용자 전용 Unix socket으로 실행 중인 앱 연결 구현

- 추가 산출물: user-manal.md, MCP·Computer Use 단독 전달용 ai-manual.md
- JavaScript 205개, MCP SDK 테스트 2개, control 3개·edit 77개·render 107개 Rust 테스트 통과
- 실제 개발용 앱에서 가져오기·프레임 추출·컷·자막·Undo/Redo·저장·재열기·MP4 렌더 통과
- 앱 재시작 후 복구와 Computer Use로 화면 동기화 확인
- 연결 가이드, 편집·복구 가이드와 전체 기능·MCP 지원 범위 작성 완료
- 기존 ai-manal.md는 ai-manual.md로 안내하는 호환 문서
- 클라이언트 개인 설정 변경 및 배포는 수행하지 않음

- 최종 Computer Use 화면 확인은 macOS 잠금으로 종료. 이전 네이티브 타임라인·복구 화면 확인 및 최종 엔진 E2E는 통과
