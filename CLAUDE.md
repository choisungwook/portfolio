# Portfolio Repository — Agent Workflow Guide

## workflow

- 만약 너가 claude.ai에 실행한 claude code라면 plugin을 설치하여 skills을 확인해야 한다.

```bash
/plugin marketplace add choisungwook/akbun-aitools
/plugin install akbun-writing@akbun-aitools
```

## 문서 구조

- 각 workspace는 `README.md` (개요 + docs/ 링크 테이블), `CLAUDE.md` (agent 컨텍스트), `docs/` (주제별 1파일)로 구성한다.
- 파일명은 lowercase, hyphen 구분. 각 파일은 H1으로 시작, H2 섹션으로 구성. 워크스페이스 간 연관관계는 CLAUDE.md frontmatter `paths`로 명시한다.
- 루트 `README.md`는 포트폴리오 전체 인덱스를 관리한다. 새 workspace 추가 시 여기에도 항목을 추가한다.

## Used skills

작성한 문서는 `writing-with-akbunstyle`로 작성하고 `akbun-docs-reviewer`로 확인

| 작업 | Skill |
|------|-------|
| 기술 문서 / 블로그 글 작성 | `akbun-writing` |
| 문서 리뷰/교정 | `akbun-docs-reviewer` |

## 코드 규칙

코드 작성 규칙은 `.claude/rules/`을 따라라.

- Kubernetes: `.claude/rules/kubernetes.md`
- Markdown: `.claude/rules/markdown.md`
- Terraform: `.claude/rules/terraform.md`

프로젝트별 추가 제약은 해당 workspace의 CLAUDE.md를 확인한다.
