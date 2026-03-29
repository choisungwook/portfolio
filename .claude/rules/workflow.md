# Workflow 규칙

GitHub 생태계를 따르면서 작업을 진행하고 작업기록을 GitHub Issue에 남긴다. 이 레포의 철학은 [philosophy.md](./philosophy.md)를 따른다.

## 작업 시작 전

- 관련 issue가 있는지 확인한다. 없으면 먼저 만든다.
- issue에 작업 시작 comment를 남긴다.

## 작업 중

- issue comment는 3가지 유형을 따른다: Changelog (진행 기록), Troubleshooting (문제/원인/해결), Follow-up (후속 issue 생성 + 링크).
- 상세 포맷은 AGENTS.md의 "Issue Comment 포맷" 섹션을 참고한다.
- 큰 작업은 sub-issue로 분할한다.

## 작업 완료 후

- commit은 Conventional Commits 형식을 따른다. amend하지 않는다.
- PR body에 `Closes #<number>`를 넣어서 Issue와 연결한다. target branch는 `master`다.
- push, merge, worktree 정리는 사용자가 직접 한다.

## Issue 닫힌 후 (회고)

- Issue가 닫히면 retrospective agent로 회고 comment를 남긴다.
- 회고 템플릿: 소요 시간 → 해결하려던 문제 → 얻은 인사이트 → 인사이트 상세.
- 상세 동작은 `.claude/agents/retrospective.md`에 정의되어 있다.

## Issue 관리

- issue body에는 무엇을 왜 하는지와 Tasks 체크박스(`## Tasks` 헤더)를 담는다.
- label은 작업 유형(`feat`, `docs`, `fix`)과 기술 태그(`kubernetes`, `aws`, `terraform`)를 함께 붙인다.
