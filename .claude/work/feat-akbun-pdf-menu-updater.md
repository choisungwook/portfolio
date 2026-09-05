# akbun-pdf 가져오기 안정화와 데스크톱 기능 보강

- Issue: #1168, #1169
- Branch: feat/akbun-pdf-menu-updater

## 실행 계획

- [x] 1. 기존 구조와 배포 상태 확인 및 PDF 가져오기 오류 재현
- [x] 2. PDF 가져오기 실패 시 불완전한 페이지 상태 방지 및 회귀 테스트 추가
- [x] 3. 네이티브 데스크톱 메뉴와 self update 구현
- [x] 4. 정적 검사, 단위 테스트, 지정 PDF와 앱 화면 검증
- [ ] 5. wiki와 ADR 갱신 후 repo-pr-ship 실행

## 다음 세션이 알아야 할 것

- 재현용 PDF는 로컬 검증에만 사용하며 파일명과 화면 캡처를 저장소나 GitHub에 남기지 않음
