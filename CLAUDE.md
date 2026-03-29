# Portfolio Repository — Agent Workflow Guide

## 목적

이 레포는 공부한 것을 기록하는 곳이다.
모든 문서는 "3개월 후의 내가 다시 봤을 때 이해할 수 있는가?"를 기준으로 쓴다.
공식 문서를 복붙하는 곳이 아니라, 내가 이해한 것을 내 말로 정리하는 곳이다.

## 나의 철학 또는 좋은 문서의 조건

좋은 문서의 조건 (우선순위 순):

1. 내 말로 쓰여 있다 — 공식 문서 문체가 아니라, 내가 이해한 방식으로 설명한다
2. "왜"가 먼저 나온다 — 동기 없는 지식은 3개월 후에 의미를 잃는다
3. 재현할 수 있다 — 핸즈온 코드가 있으면 동작해야 한다
4. 삽질 과정이 있으면 보너스 — 뭘 시도했고, 뭐가 안 됐고, 어떻게 해결했는지

나쁜 문서: 공식 문서 번역체, 기능 나열("~할 수 있다"), 설명 없는 코드

## workflow

작업 흐름, 에이전트 활용, Git Worktree 규칙은 [`.claude/rules/workflow.md`](./.claude/rules/workflow.md)에 정의되어 있다.

## 문서 구조

각 workspace는 `README.md` (개요 + docs/ 링크 테이블), `CLAUDE.md` (agent 컨텍스트), `docs/` (주제별 1파일)로 구성한다.

파일명은 lowercase, hyphen 구분. 각 파일은 H1으로 시작, H2 섹션으로 구성. 워크스페이스 간 연관관계는 CLAUDE.md frontmatter `paths`로 명시한다.

루트 `README.md`는 포트폴리오 전체 인덱스를 관리한다. 새 workspace 추가 시 여기에도 항목을 추가한다.

## Skills

| 작업 | Skill |
|------|-------|
| 기술 문서 / 블로그 글 작성 | `writing-with-akbunstyle` |
| 아키텍처 시각화 프롬프트 | `arch-viz-prompter` |
| 문서 리뷰/교정 | `docs_reviewer` |

한국어 문서는 `writing-with-akbunstyle`로 작성, 커밋 전에 `docs_reviewer`로 확인. 각 workspace CLAUDE.md에 `## Used Skills` 섹션을 넣는다.

## 코드 규칙

코드 작성 규칙은 `.claude/rules/`에 정의되어 있다.

- Kubernetes: `.claude/rules/kubernetes.md`
- Markdown: `.claude/rules/markdown.md`
- Terraform: `.claude/rules/terraform.md`

프로젝트별 추가 제약은 해당 workspace의 CLAUDE.md를 확인한다.
