# 코드 리뷰 체계 보강: 검증 증거, 리뷰 기준 파일, PR 공통 CI

- Issue: 미생성
- Branch: claude/vibrant-cannon-3wfxfh

## 실행 계획

- [x] 1. AGENTS.md에 검증과 리뷰 절 추가
- [x] 2. .github/copilot-instructions.md 신규 작성 (리뷰어 기준)
- [x] 3. PR 템플릿 검증·리스크 절 보강, evaluator rubric 동기화
- [x] 4. repo-pr-create, repo-pr-fix, repo-pr-ship, repo-pr-copilot-review command 갱신
- [x] 5. verify-pull-request.yml 작성 (바뀐 파일 lint, PR body 형식)
- [ ] 6. Issue와 PR 생성

## 다음 세션이 알아야 할 것

- yamllint는 CI에서 뺌. 핸즈온 yaml 157개가 이미 실패해 바뀐 파일만 검사해도 기존 문제에 걸림
- 버전 확인 결과: actionlint v1.7.12, markdownlint-cli 0.49.1, setup-terraform v4.0.1, checkout v7, setup-node v7
