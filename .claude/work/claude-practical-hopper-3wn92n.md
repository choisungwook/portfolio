# taskq: 폴링 1분으로 변경, 상태별 Run now 버튼

- Issue: 없음 (PR 생성 전에 만든다)
- Branch: claude/practical-hopper-3wn92n

## 실행 계획

- [x] 1. 인터페이스: `src/wake.ts` WakeSignal, `src/runner/control.ts` RunControl
- [x] 2. runner, approval 대기, SSE가 WakeSignal로 대기. `pollSec` 기본값 60
- [x] 3. `POST /tasks/:id/run`과 `prepareRun`, runner의 runNow
- [x] 4. UI: 작업 상세 Run now, 보드 카드 Run
- [x] 5. 테스트, 화면 확인, wiki/manual/knowledge, 버전
- [ ] 6. PR, squash merge

## 다음 세션이 알아야 할 것

- 같은 프로세스의 변경(API 쓰기, run 종료, 이벤트 기록)은 신호로 즉시 깨우고, CLI처럼 다른 프로세스의 변경은 1분 fallback으로 반영
