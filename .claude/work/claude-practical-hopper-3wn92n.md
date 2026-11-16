# taskq: agent backend 인터페이스 도입, Claude SDK를 첫 구현으로 이동

- Issue: 없음 (PR 생성 전에 만든다)
- Branch: claude/practical-hopper-3wn92n

## 실행 계획

- [x] 1. `src/agents/types.ts` 인터페이스와 `src/agents/index.ts` 레지스트리
- [x] 2. Claude 전용 파일을 `src/agents/claude/`로 이동, `claudeBackend` 구현
- [x] 3. config `agent` 키, `run.ts`와 retrospect를 인터페이스로 연결
- [x] 4. 테스트 import 갱신, 레지스트리 테스트, typecheck
- [x] 5. wiki, manual, knowledge, 버전 갱신
- [ ] 6. PR #1495 merge 후 branch를 master에서 다시 시작하고 commit, push, PR, squash merge

## 다음 세션이 알아야 할 것

- PR #1495(tamper 중단)가 merge 대기 중. 이 작업은 그 위에서 시작했고, merge 뒤 branch를 master로 다시 만들어 올림
