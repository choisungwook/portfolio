# akbun-taskq에 역할별 상주 agent 팀 추가

- Issue: 없음 (사용자 요청 세션에서 직접 진행)
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
- [ ] 13. persona 2차 리뷰 반영

## 다음 세션이 알아야 할 것

- persona 내용은 private 저장소 것이라 portfolio에 옮기지 않는다. 경로를 config로만 받는다.
- 005_team.sql은 아직 릴리스 전이라 owner, threads, trigram을 005에 합쳤다. 릴리스 뒤에는 새 번호로 추가한다.
- 1차 리뷰용 시나리오 스크립트는 scratchpad의 scen.ts(세션이 끝나면 사라짐).
