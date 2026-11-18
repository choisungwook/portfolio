# akbun-taskq: wiki export·import, worktree, Plugins SDK 하위 메뉴, n8n식 workflow 편집기

- Issue: 새로 만들 예정 (root #1483)
- Branch: claude/taskq-agent-expansion-cqvk13

## 실행 계획

- [x] 1. 테스트·CI 병렬 실행 (PR #1518에 포함)
- [x] 2. bot 목록 스크롤
- [x] 3. task 저장소·폴더 선택, 쓰기 작업 worktree, 작업 공간 패널(diff, PR, VS Code)
- [x] 4. wiki export(zip level 9)와 소화하는 import를 이어 하기 가능한 백그라운드 job으로
- [ ] 5. Plugins 메뉴를 Claude / OpenAI 하위 메뉴로
- [ ] 6. n8n처럼 끌어서 편집하는 workflow 편집기
- [ ] 7. 버전 0.10.0, CHANGELOG, 문서, 리뷰, PR, squash merge

## 다음 세션이 알아야 할 것

- 0.9.0은 PR #1518로 master에 들어감. 이번 변경은 새 버전(0.10.0)과 새 CHANGELOG 절이 필요함
- 브랜치는 master에서 다시 시작했고, 이전 PR 기록은 `-s ours` merge로만 이어 붙임(force push 없음)
- commit, PR, Issue 본문에 Claude-Session 링크를 넣지 않음(저장소 규칙)
