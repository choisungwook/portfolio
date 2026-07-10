# Workflow 규칙

GitHub 생태계 안에서 작업한다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따른다.

## 전체 흐름

1. Worktree 생성 → 2. 작업 수행 → 3. Commit + Push → 4. PR 생성 + 기록용 Issue 생성

- 작업 시작 전에 issue를 만들거나 작업 중간에 issue comment를 남기지 않는다. Issue는 PR을 만들 때 함께 만든다.
- Review, Merge, Worktree 정리는 사용자가 직접 한다.
- PR의 commit은 1개만 있다. commit이 여러 개가 되면 1개로 합친다.

## Git Worktree

git worktree를 사용하여 여러 agent가 동시에 작업할 때 branch switching 충돌을 방지한다.

worktree 생성 명령:

```bash
git worktree add ../portfolio-<topic> -b <branch-name>
```

- Branch 이름: `<type>/<short-description>` (feat, docs, fix, refactor, chore)
- 여러 agent가 동시에 작업할 때 같은 파일을 두 agent가 동시에 수정하지 않는다 (파일 단위 분할).

## Issue와 PR 공통 작성 규칙

- 문어체로 간단명료하게 작성한다. 주절주절 설명하지 않는다.
- backtick을 사용하지 않는다.
- label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.

## Issue 작성 규칙

PR을 생성할 때 기록용 GitHub Issue를 함께 만들고 PR body에서 링크한다.

- 템플릿: [.github/ISSUE_TEMPLATE/work-record.md](../../.github/ISSUE_TEMPLATE/work-record.md)를 따른다.
- **Goal**: 작업의 목표를 2문장 미만으로 작성한다.
- **ADR**: 작업 중 내린 의사결정을 "결정 - 이유" 형태로 항목화한다.

## PR 작성 규칙

- 템플릿: [.github/pull_request_template.md](../../.github/pull_request_template.md)를 따른다.
- **Goal**: 해결하려는 문제 또는 공부하려는 주제를 3문장 미만으로 작성한다.
- **어떻게 해결했는가**: 해결 과정 또는 정리한 내용을 항목으로 작성한다.
- 본문 끝에 기록용 issue를 `Issue #<number>` 형식으로 링크한다.
- target branch는 `master`로 설정한다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.
