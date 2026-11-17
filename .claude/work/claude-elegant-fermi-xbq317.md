# akbun-keychain 구현 시작: plan 0단계(scaffold)와 1단계(core)

- Issue: 없음 (설계 Issue #1502, 설계 PR #1503)
- Branch: claude/elegant-fermi-xbq317

## 실행 계획

- [x] 1. 0단계: workspace scaffold, version 명령, build-binary, trivial test
- [x] 2. 0단계: Linux에서 bun 바이너리 빌드 확인, development.md 표 갱신
- [-] 3. 0단계: Windows/macOS spike — 건너뜀: Linux 컨테이너라 실행 불가, 7단계 CI matrix 또는 실기기에서 확인
- [ ] 4. 1단계: core (canonical, crypto, paths, vault-file, lockfile, vault, audit)
- [ ] 5. 1단계: plan의 완료 조건 테스트 전부 작성, 통과
- [ ] 6. wiki/README 상태 갱신, knowledge log

## 다음 세션이 알아야 할 것

- 컨테이너 Node는 22.23. type stripping 동작. design은 Node 24 기준
- repo 규칙상 commit message에 claude session 링크를 넣지 않음
