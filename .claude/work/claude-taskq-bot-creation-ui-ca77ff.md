# taskq bot 생성·연결·플러그인 화면 정리

- Branch: claude/taskq-bot-creation-ui-ca77ff

## 실행 계획

- [x] 1. skill·plugin·MCP를 bot 선택 대신 타입별 공유로 (db/team.ts toAgent, 등록 변경 시 전체 reload)
- [x] 2. routine 기능 제거 (routes, tools, hub, review, UI)
- [x] 3. Claude bot도 bot마다 인증 방식(api/subscription/bedrock)
- [x] 4. 연결 API: 방식별 test(5초), save 후 test, clear, OpenAI 키 저장
- [x] 5. bot 생성 UI: Agent type, 인증 방식 행 / bot 설정에서 skills·routines 제거
- [x] 6. 연결 UI: Claude·OpenAI·Kiro H2 섹션
- [x] 7. Plugins에 Kiro 탭
- [x] 8. 색(오른쪽=왼쪽), H1/H2/H3 여백
- [ ] 9. test, 화면 확인, wiki·knowledge·CHANGELOG·버전, PR squash merge

## 다음 세션이 알아야 할 것

- 연결 화면의 Claude 방식 = 전역 기본값(config.provider). bot의 provider가 null이면 그것을 따른다
