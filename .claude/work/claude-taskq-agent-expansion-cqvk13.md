# akbun-taskq: 설정 화면 좌측 메뉴, 연결 설정, bot 페이지 연결 상태, bot 무응답 진단

- Issue: (PR 때 생성)
- Branch: claude/taskq-agent-expansion-cqvk13

## 실행 계획

- [x] 1. 백엔드: `src/team/connections.ts`(Claude provider, OpenAI api/bedrock/chatgpt, Kiro 상태 + 사용하는 bot + 마지막 turn), `GET /connections`, `GET /bots/:name/connection`, operation
- [x] 2. 설정 화면을 왼쪽 메뉴 + 오른쪽 페이지로, 연결(Connections) 페이지 추가(Kiro 로그인 이동)
- [x] 3. bot 페이지 오른쪽에 연결 패널(어떤 연결, 상태, 응답하지 않는 이유)
- [x] 4. 테스트, 데모 화면 확인, 문서·CHANGELOG 0.11.0
- [ ] 5. PR, squash merge

## 다음 세션이 알아야 할 것

- bot 무응답의 흔한 원인: `bots.enabled` 기본 false, Claude `provider` 기본 bedrock(aws 프로파일 필요), 팀 일시정지, bot 꺼짐, 마지막 turn 실패
