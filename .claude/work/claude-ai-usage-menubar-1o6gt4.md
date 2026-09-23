# akbun-ai-useage 제품 생성

- Issue: 미생성
- Branch: claude/ai-usage-menubar-1o6gt4

## 실행 계획

- [x] 1. workspace: provider 파서(claude, codex, kiro, admin API)와 테스트
- [x] 2. workspace: main(tray), settings, update
- [x] 3. release workflow
- [x] 4. README, wiki, adr, knowledge
- [x] 5. 인덱스 3곳 갱신(product/README.md, 루트 README.md, products.json)

## 다음 세션이 알아야 할 것

- Electron 선택: 메뉴바가 주 화면이라 skill 기준상 Electron. akbun-screenshot 패턴 재사용
- 실기기(macOS) 미검증: Electron 실행, OAuth usage 호출, kiro-cli 출력은 문서·타 프로젝트 기준으로 파싱
- 다음: /repo-pr-create로 Issue와 PR 생성, 그 전에 이 파일 삭제
