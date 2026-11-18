# akbun-taskq에 역할별 상주 agent 팀 추가

- Issue: #1517 (root #1483)
- Branch: claude/taskq-agent-expansion-cqvk13

## 실행 계획

- [x] 1. 005_team.sql: team_agents, team_messages, wiki_pages, wiki_revisions, wiki_fts
- [x] 2. db/team.ts, db/wiki.ts 쿼리
- [x] 3. team/: 로스터(lead, planner, coder, reviewer, doc-reviewer), TeamBackend 인터페이스, hub 루프, MCP 도구
- [x] 4. agents/claude/team.ts: resume 기반 상주 세션 구현
- [x] 5. finish.ts: assignee 작업 결과를 mailbox로 전달
- [x] 6. CLI(team), API(/api/team), run.ts 연결
- [x] 7. 테스트
- [x] 8. wiki, knowledge decision, CHANGELOG, manual, 버전 0.9.0
- [x] 9. akbun-persona 리뷰 모드로 서브에이전트 비판 → 수정 (1차: 8개 지적 반영)
- [x] 10. wiki 검색: trigram + 링크 확장 + 파일 미러(graphify)
- [x] 11. task owner 열, 중복 검사, assign_task, UI 배지
- [x] 12. 토론(team_threads)
- [x] 13. persona 2차 리뷰 반영
- [x] 14. Team → Bots, 왼쪽 사이드바와 bot별 채팅, soft 테마
- [x] 15. bot 설정·게이트·생성/삭제·글로벌 설정·제한·언어·테마·첨부·검색·메모리 (5차 요청)
- [x] 16. Plugins 메뉴, live input(실행 중 turn에 메시지 추가), compose bar 모델/effort/권한 메뉴, slash command, catalog API
- [x] 17. Workflows: 정의, task 할당, 봇 실행, 실행 기록(Argo식), 삭제 표시
- [x] 18. OpenAI Agents SDK backend (auto mode 없음, 권한 모드로 도구 구성)
- [ ] 19. CLI와 MCP 서버로 모든 기능 제공
- [ ] 20. 문서(architecture API 표, sdk-usage, CHANGELOG SDK 절, features, manual, knowledge), 테스트
- [ ] 21. 이 파일 삭제, PR(본문 scratchpad/pr-body.md, 세션 링크 금지), squash merge, Issue close

## 다음 세션이 알아야 할 것

- persona 내용은 private 저장소 것이라 portfolio에 옮기지 않는다. 경로를 config로만 받는다.
- 005_team.sql은 아직 릴리스 전이라 owner, threads, trigram을 005에 합쳤다. 릴리스 뒤에는 새 번호로 추가한다.
- 1차 리뷰용 시나리오 스크립트는 scratchpad의 scen.ts(세션이 끝나면 사라짐).
- commit, PR, Issue 본문에 Claude-Session 링크를 넣지 않는다(저장소 규칙). Co-Authored-By만 둔다.
