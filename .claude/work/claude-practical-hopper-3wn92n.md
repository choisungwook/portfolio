# taskq: 하네스 변조 시도 차단 시 run 중단, hook fail-closed

- Issue: 없음 (PR 생성 전에 만든다)
- Branch: claude/practical-hopper-3wn92n

## 실행 계획

- [x] 1. gate.ts에 하네스 변조 판별 함수 추가
- [x] 2. hooks.ts: 변조 시도면 run 중단, hook 오류는 deny
- [x] 3. sdk-worker.ts: 중단된 run을 failed + critical alert로 반환
- [x] 4. 테스트 추가, typecheck
- [x] 5. wiki/architecture, knowledge decision, log, 버전 갱신
- [x] 6. commit, push

## 다음 세션이 알아야 할 것

- 근거: Fable 5.2 multi-agent 블로그(분류기 block 시 팀 중단 후 사람 검토, fail-closed)
