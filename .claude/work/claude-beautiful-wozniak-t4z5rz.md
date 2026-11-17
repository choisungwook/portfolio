# akbun-keychain 설계 문서와 구현 plan 작성

- Issue: PR 생성 시 만듦
- Branch: claude/beautiful-wozniak-t4z5rz

## 실행 계획

- [x] 1. 참고 product(akbun-makepresentation, akbun-taskq)와 규칙 확인
- [x] 2. bun 1.4.4에서 scrypt, AES-GCM AAD, HKDF, Unix socket, wx lock 동작 검증
- [x] 3. README, wiki(설계 문서, plan), knowledge decisions 작성
- [x] 4. 인덱스 3곳 갱신
- [ ] 5. 서브에이전트 리뷰, Issue와 PR 생성, squash merge
- [-] 6. release workflow 작성 — 건너뜀: 빌드할 코드가 없어 workflow가 실패함. wiki/plan.md 7단계에 명세로 남김

## 다음 세션이 알아야 할 것

- 이번 PR은 설계 문서만 담음. workspace/는 구현 1단계에서 만듦
