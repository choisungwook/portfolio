# akbun-keychain plan 2~7단계 전부 구현과 release workflow

- Issue: 미생성 (root #1501)
- Branch: claude/elegant-fermi-xbq317 (PR #1505 merge 뒤 master에서 다시 시작)

## 실행 계획

- [x] 1. 2단계: CLI (command table, help, prompt, init/status/list/set/get/edit/rm/passwd/verify/audit)
- [x] 2. 3단계: agent, sessions, policy (unlock/lock, socket, agent.json)
- [x] 3. 4단계: run과 masking
- [x] 4. 5단계: MCP server
- [x] 5. 6단계: GUI server와 page (Carbon token)
- [x] 6. 7단계: release-akbun-keychain.yml, product-versions.json, manual.md, 인덱스
- [ ] 7. critical-minimum 갱신, wiki 갱신, 리뷰, PR, CI 통과 후 merge, release 확인

## 다음 세션이 알아야 할 것

- 버전은 0.2.0으로 올림 (0.1.0은 release 안 됨, existing_tag fail이라 base와 달라야 함)
- MCP는 zod 없이 low-level Server와 JSON schema로 작성
- 컴파일 바이너리에서 unlock(agent 분리 실행), run, MCP tools/list, gui 자원 제공을 Linux에서 확인함
- critical 테스트 30개, minimum 30
- repo 규칙상 commit message에 claude session 링크를 넣지 않음
