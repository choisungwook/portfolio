# Workflow 규칙

GitHub 생태계를 따르면서 작업을 진행하고 작업기록을 GitHub Issue에 남긴다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따른다.

## 전체 흐름

1. Issue 생성 → 2. Worktree 생성 → 3. 작업 수행 → 4. Commit + Push → 5. PR 생성 → 6. (Issue 닫힌 후) 회고 comment

- Review, Merge, Worktree 정리는 사용자가 직접 한다.
- PR의 commit은 1개만 있다. commit이 여러 개가 되면 1개로 합친다.
- issue body에는
  - 어떤 문제를 해결하는지를 2문장 미만으로 작성
  - label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.
- PR body는 아래 4개 섹션을 이 순서대로 사용한다.

  ````markdown
  ## 어떤 문제를 해결 또는 공부하려 했는가

  5문장 미만으로 작성한다. 문제 해결인지 공부 정리인지를 한 문장에서 명확히 구분한다.

  ## 문제를 어떻게 해결 또는 공부했는가

  앞 섹션이 문제 정의면 해결 과정을, 공부 주제면 정리한 내용을 적는다.

  ## GitHub Issue (선택)

  관련 issue가 있으면 `Issue #<number>` 링크를 남긴다.

  ## 파일 디렉터리 구조

  추가·변경된 파일을 tree로 그리고, 각 파일이 무엇인지 한 줄씩 설명한다.
  ````

- target branch는 `master`로 설정한다.
- label은 작업 유형(예: `feat`, `docs`, `fix`)과 기술 태그(예: `kubernetes`, `aws`, `terraform`)를 함께 붙인다.
- 사용자가 요청하면 git diff를 다시 읽고 PR body를 재작성한다. Issue 번호는 유지한다.

## Git Worktree

git worktree를 사용하여 여러 agent가 동시에 작업할 때 branch switching 충돌을 방지한다.

worktree 생성 명령:

```bash
git worktree add ../portfolio-<topic> -b <branch-name>
```

- Branch 이름: `<type>/<short-description>` (feat, docs, fix, refactor, chore)
- 여러 agent 동시 작업 시 핵심 원칙은 **파일 단위 분할** — 같은 파일을 두 agent가 동시에 수정하지 않는다.

## 작업 시작 전

- 관련 issue가 있는지 확인한다. 없으면 먼저 만든다.
- issue에 작업 시작 comment를 남긴다.
- issue comment는 3가지 유형을 따른다:
  - **Changelog**: 진행 기록 — 무엇을 했는지 시간순으로 남긴다.
  - **Troubleshooting**: 문제 / 원인 / 해결 — 삽질 과정을 기록한다.
  - **Follow-up**: 후속 issue 생성 + 링크 — 범위를 벗어나는 작업을 분리한다.
