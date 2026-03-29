# Workflow 규칙

GitHub 생태계를 따르면서 작업을 진행하고 작업기록을 GitHub Issue에 남긴다. 글쓰기 원칙은 [philosophy.md](./philosophy.md)를 따른다.

## 전체 흐름

1. Issue 생성 → 2. Worktree 생성 → 3. 작업 수행 → 4. Commit + Push → 5. PR 생성 → 6. (Issue 닫힌 후) 회고 comment

Review, Merge, Worktree 정리는 사용자가 직접 한다.

## 에이전트 활용

`.claude/agents`에 목적별로 구분한 agent가 있다. 생성과 평가를 분리한다. AI 모델은 자기 결과물에 관대하므로, 별도의 평가자가 검토하면 품질이 올라간다.

| 에이전트 | 파일 | 워크플로우 |
|----------|------|-----------|
| 기획자(Planner) | `.claude/agents/planner.md` | 파이프라인 |
| 생성자(Generator) | `.claude/agents/generator.md` | 파이프라인 |
| 평가자(Evaluator) | `.claude/agents/evaluator.md` | 파이프라인 |
| 회고(Recap) | `.claude/agents/recap.md` | Issue 닫힌 후 수동 호출 |

에이전트 파이프라인 구조:

```
기획자 ──(사양)──▶ 생성자 ◀──(피드백)──▶ 평가자
  │ 1회 실행         │ 반복 루프             │ 반복 루프
```

## Git Worktree

branch checkout 대신 git worktree를 사용한다. 여러 agent가 동시에 작업할 때 branch switching 충돌을 방지한다.

worktree 생성 명령:

```bash
git worktree add ../portfolio-<topic> -b <branch-name>
```

- Branch 이름: `<type>/<short-description>` (feat, docs, fix, refactor, chore)
- 여러 agent 동시 작업 시 핵심 원칙은 **파일 단위 분할** — 같은 파일을 두 agent가 동시에 수정하지 않는다.

## 작업 시작 전

- 관련 issue가 있는지 확인한다. 없으면 먼저 만든다.
- issue에 작업 시작 comment를 남긴다.

## 작업 중

- issue comment는 3가지 유형을 따른다:
  - **Changelog**: 진행 기록 — 무엇을 했는지 시간순으로 남긴다.
  - **Troubleshooting**: 문제 / 원인 / 해결 — 삽질 과정을 기록한다.
  - **Follow-up**: 후속 issue 생성 + 링크 — 범위를 벗어나는 작업을 분리한다.
- 큰 작업은 sub-issue로 분할한다.

## 작업 완료 후

- claude.ai에서 Claude Code를 실행할 때는 commit과 push를 agent가 수행하고 commit 1개만 생성하도록 한다. 여러개 commit이 생기면 PR이 복잡해지고 리뷰하기 어려워진다.
- PR body에 `Closes #<number>`를 넣어서 Issue와 연결한다. target branch는 `master`다.

## Issue 관리

- issue body에는 무엇을 왜 하는지와 Tasks 체크박스(`## Tasks` 헤더)를 담는다.
- label은 작업 유형(`feat`, `docs`, `fix`)과 기술 태그(`kubernetes`, `aws`, `terraform`)를 함께 붙인다.
