---
type: Decision
title: A code task in a git repository works in its own worktree, made when the task is created
description: createFromInput makes a worktree and branch per code task and points data.repo at it, so the worker, gate and review work there unchanged; the user's checkout is never written.
tags: [tasks, git, worktree]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-18T23:30:00Z }
---

## 결정

- 쓰기 작업(code)의 `repo`가 git 저장소면 작업을 만들 때 `git worktree add -b taskq/<task> TASKQ_HOME/worktrees/<repo>-<task> <HEAD>`로 worktree를 만든다. 기본은 켜짐이고 `worktree: false`로 끈다.
- `data.repo`를 worktree 경로로 바꾸고 원래 저장소는 `data.source_repo`, 브랜치·기준은 `data.worktree`에 둔다. `base_commit`도 기준 커밋으로 채운다.
- 읽기 작업(research, ops)과 일반 폴더에는 만들지 않는다.
- worktree 삭제는 폴더만 지우고 브랜치를 남기며, task는 지워진 경로를 계속 가리킨다.
- PR 링크는 GitHub API를 부르지 않고 실행 요약과 bot 메시지에서 그 저장소의 `/pull/N` URL을 찾는다. 없으면 비교 링크를 보여 준다.

## 이유

- worker, 게이트, 보안 리뷰는 모두 `data.repo`를 작업 경로로 읽는다. 생성 시점에 `repo`를 바꾸면 이 코드를 하나도 고치지 않고 worktree에서 돈다. 실행 시점에 만들면 worker와 bot 시작 두 경로에 같은 처리를 넣어야 했다.
- 생성 시점에 만들면 작업 상세가 시작 전에도 경로와 브랜치를 보여 줄 수 있다. 초안이 쓰지 않는 worktree를 남기는 비용은 작다.
- 삭제 뒤 `repo`를 원래 저장소로 되돌리면 다시 실행할 때 사용자의 checkout에 직접 쓴다. 실패가 덜 위험하다.
- taskq는 GitHub 토큰을 갖지 않는다. 토큰 없이 PR을 찾는 방법은 bot이나 실행이 남긴 URL뿐이고, bot에게 PR URL을 요약에 적으라고 `start_task`에서 알린다.

관련: [Bots work on their own tasks](2026-11-bots-execute-tasks.md)
