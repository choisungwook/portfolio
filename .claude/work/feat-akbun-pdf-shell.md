# akbun-pdf Tauri 골격과 뷰어 레이아웃

- Issue: #1142
- Branch: feat/akbun-pdf-shell

## 실행 계획

- [x] 1. Tauri·TypeScript·PDF.js workspace와 경계 디렉터리 생성
- [x] 2. PDF 뷰어 3영역 레이아웃과 네 가지 화면 상태 구현
- [x] 3. README, AGENTS.md, wiki, ADR, 제품 인덱스 작성
- [x] 4. 릴리스·자동 업데이트 워크플로우와 서명 Secret 구성
- [x] 5. 파일 크기 검사, UI, TypeScript, Rust 검증
- [ ] 6. 커밋·PR·리뷰·머지와 Issue 종료

## 다음 세션이 알아야 할 것

- updater 개인 키는 기존 제품 관례대로 사용자 .tauri 디렉터리에 백업
- GitHub Secret 업데이트는 사용자 사전 승인됨
- GitHub updater Secret 두 개 등록 완료
- 네 화면 상태와 페이지 이동·확대 확인, 브라우저 console 오류 없음
- npm run check와 Tauri app cargo check 통과
