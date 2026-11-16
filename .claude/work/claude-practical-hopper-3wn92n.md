# taskq UI에 Carbon Design System 적용

- Issue: 없음 (PR 생성 전에 만든다)
- Branch: claude/practical-hopper-3wn92n

## 실행 계획

- [x] 1. 후보 비교와 선택: Carbon(Apache-2.0). before 스크린샷
- [ ] 2. 인터페이스: `ui/css/theme/contract.css` 토큰 계약, 구현: `ui/css/theme/carbon.css`
- [ ] 3. 컴포넌트 CSS를 Carbon 규칙으로: 버튼, 입력, 탭, tag, notification, modal, tile
- [ ] 4. UX 패턴: status indicator(색+모양+글자), inline notification 닫기, 빈 상태
- [ ] 5. 토큰 계약 테스트, after 스크린샷 비교
- [ ] 6. wiki, knowledge(decision, reference), NOTICE, 버전
- [ ] 7. PR, squash merge

## 다음 세션이 알아야 할 것

- demo: `TASKQ_DEMO_PORT=4640 npm run demo`, 스크린샷 스크립트는 세션 scratchpad에 있었음(재작성 필요)
