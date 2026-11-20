---
type: Decision
title: Marketplace plugins install at the commit the marketplace lists, into TASKQ_HOME/plugins
description: Install fetches only the pinned commit with git (sparse for a subfolder), registers it under the marketplace name, and updates by installing again.
tags: [plugins, marketplace, git, security]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-20T23:50:00Z }
---

## 결정

- Plugins의 공식 marketplace 목록에서 설치하면 git으로 그 항목의 `sha`(없으면 `ref`, 둘 다 없으면 기본 branch)만 받는다. plugin이 큰 저장소 안의 폴더면 sparse checkout으로 그 폴더만 받는다.
- 받는 곳은 `TASKQ_HOME/plugins/<이름>`이고, 등록 이름은 marketplace의 이름이다. plugin 자체 `plugin.json`의 이름이 더 짧아도 marketplace 이름을 쓴다.
- `plugin.json`이 없는 `strict: false` 항목은 marketplace 항목의 manifest 필드로 `plugin.json`을 만든다.
- 업데이트는 `git pull`이 아니라 marketplace의 현재 commit으로 다시 설치한다. 삭제하면 taskq가 받은 폴더도 지우고, 경로로 등록한 폴더는 지우지 않는다.
- https git 주소만 받는다. 폴더 경로에 `..`가 있거나, `sha`가 16진 commit id가 아니거나, `ref`가 `-`로 시작하는 등 평범한 branch·tag 이름이 아니면 설치할 수 없음으로 보인다. 이 값들이 git 인자로 들어가기 때문이다. `command` 같은 다른 source도 같다.
- 같은 이름의 설치는 한 번에 하나만 한다. 폴더 삭제는 `plugins/<그 이름>` 아래일 때만 한다.

## 이유

- marketplace가 적어 둔 commit은 목록을 관리하는 쪽이 고른 버전이다. branch 끝을 받으면 목록에 오른 뒤 바뀐 코드가 들어오고, plugin의 hook과 MCP server는 bot의 tool call 밖에서 실행되므로 무엇이 들어오는지 고정하는 편이 낫다.
- 설치하면 모든 Claude bot이 다음 turn부터 그 사본을 불러온다(0.26.0부터 등록한 것은 모든 bot이 함께 쓴다, [결정](2026-11-shared-registry-and-signin.md)). 설치가 곧 사용이라 무엇을 받는지 commit으로 고정하는 일이 더 중요해졌다.
- 받은 폴더가 detached commit이라 `git pull`로 따라갈 branch가 없다. 다시 설치하는 쪽이 고정된 commit을 그대로 따른다.
- Claude Code도 marketplace 이름으로 plugin을 식별한다. 실제 목록에서 partner plugin의 manifest 이름이 marketplace 이름과 다른 경우가 있어, 이름이 다르다고 거부하면 설치되지 않는 항목이 생긴다.
- 경로로 등록한 폴더는 사용자의 작업 폴더일 수 있어 taskq가 지우지 않는다. taskq가 받은 폴더만 taskq가 지운다.
