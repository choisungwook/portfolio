# akbun-ai-useage 제품 생성

- Issue: 미생성
- Branch: claude/ai-usage-menubar-1o6gt4

## 실행 계획

- [x] 1. workspace: provider 파서(claude, codex, kiro, admin API)와 테스트
- [x] 2. workspace: main(tray), settings, update
- [x] 3. release workflow
- [x] 4. README, wiki, adr, knowledge
- [x] 5. 인덱스 3곳 갱신(product/README.md, 루트 README.md, products.json)

- [x] 6. Electron에서 Tauri(Rust, 웹뷰 없는 트레이)로 전환: 바이너리 크기 요구

## 다음 세션이 알아야 할 것

- Tauri 선택 이유: 바이너리 경량 요구. 트레이 메뉴가 네이티브라 skill의 Electron 조건(웹뷰 UI 플랫폼별 확인)에 해당 안 함
- 로직은 전부 src-tauri/crates/core(usage-core). tauri 의존 없이 cargo test
- 업데이트 서명 키는 이 세션에서 생성, 공개키만 tauri.conf.json에 있음. 사용자가 TAURI_SIGNING_PRIVATE_KEY_AIUSEAGE secret 등록 필요
- 실기기(macOS) 미검증: 트레이 표시, OAuth usage 호출, kiro-cli 출력. Linux Xvfb 기동만 확인
- 다음: /repo-pr-create로 Issue와 PR 생성, 그 전에 이 파일 삭제
