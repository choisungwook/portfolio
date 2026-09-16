# GPT-6 Astra 글 기준으로 AGENTS.md와 규칙 파일 정리

- Issue: 없음 (PR 생성 시 만든다)
- Branch: claude/update-agents-md-gvesl1

## 실행 계획

- [x] 1. AGENTS.md: 강조어와 반복 경고 제거, 상황별 문서 포인터로 전환, 완료 기준 섹션 추가
- [x] 2. .claude/rules/index.md: MANDATORY/CRITICAL 제거, 라우팅 표만 남김
- [x] 3. .claude/rules/knowledge.md, workflow.md: 강조어 제거, 근거 반복 축소
- [x] 4. .claude/commands: description을 트리거 중심으로 짧게, repo-handson의 AGENTS.md 템플릿 문단 축소
- [x] 5. .claude/agents/evaluator.md: 없는 AGENTS.md quality 섹션과 옛 PR 템플릿 참조 수정
- [x] 6. commit, push

## 다음 세션이 알아야 할 것

- 원문은 developers.openai.com이 차단되어 Readwise Reader 사본(01m2kpv14ky9s9k1tpbarfjm3m)으로 읽음
- 원문 권고: skill description은 짧고 언제 쓰는지 명확히, 루트 문서는 라우터로, 문서는 "매번 읽어라" 대신 "X는 Y할 때", 테스트 실행 독려와 강한 경계 문구는 모델을 일찍 멈추게 하므로 제거, 완료 기준을 먼저 정의
