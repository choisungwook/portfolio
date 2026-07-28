# Claude Code Guide

이 저장소의 모든 규칙은 [AGENTS.md](./AGENTS.md)를 따른다. AGENTS.md가 모든 agent의 단일 진입점이다. 아래는 Claude Code에만 해당하는 내용이다.

## 코드 규칙 로드

코드 작성 규칙은 `.claude/rules/`에 있고 세션 시작 시 전부 로드된다. 따로 찾아 읽지 않는다.

## 문서 작성 도구

`akbun-*` plugin이 설치되어 있으면 문서 작성과 검토에 사용한다. 없으면 이 절차를 건너뛴다.

1. `akbun-writing` skill로 초안을 쓴다.
2. `akbun-style-reviewer` agent로 스타일을 검증하고 통과할 때까지 수정한다.
3. `akbun-docs-reviewer` skill로 문장과 구조를 다듬는다.
