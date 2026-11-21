---
type: Decision
title: Every bot carries a built-in taskq skill written from the running version
description: skills/taskq/SKILL.md and manual.md ship in the binary and are written into TASKQ_HOME on every start; bots get it outside the registry, read only, with taskq_info and workflow tools.
tags: [bots, skills, manual, workflows]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T13:00:00Z }
---

## 결정

- bot이 자기가 taskq 안에서 돈다는 것, 지금 버전, 그 버전의 매뉴얼을 알도록 기본 skill `taskq`를 둔다. 원본은 이 product의 `workspace/skills/taskq/SKILL.md`와 `workspace/manual.md`이고, 바이너리에 함께 실린다.
- taskq는 시작할 때마다 둘을 `TASKQ_HOME/builtin-skills/taskq`에 다시 쓰고(버전, home, 매뉴얼 경로를 채움) 모든 bot의 skill 사본을 다시 만든다. 업데이트는 새 바이너리이고 다시 시작하면 skill도 새 버전이 된다.
- 등록 목록(registry) 밖에 둔다. 모든 bot의 첫 skill로 항상 실리고, 같은 이름의 등록은 거부한다. Plugins 화면에서는 보기만 된다.
- 매뉴얼을 skill 파일에 통째로 넣지 않고 경로로 가리킨다. bot은 필요한 절만 읽는다. 사람은 `taskq manual [--search WORD]`, 프로그램은 `GET /manual`로 같은 글을 읽는다.
- bot 도구로 `taskq_info`(버전, home, 매뉴얼 경로), `create_workflow`, `update_workflow`를 더했다. bot은 `taskq` CLI를 실행할 수 없으므로(데이터 보호) 필요한 일은 도구로 준다.

## 이유

- bot의 메모리나 wiki에 남은 taskq 설명은 업데이트하면 낡는다. 실행 중인 바이너리가 직접 쓴 파일만 버전과 맞는다는 보장이 있다.
- 매뉴얼은 계속 고쳐지므로 skill 본문과 따로 둔다. skill 본문은 짧게 두고 무엇을 어디서 읽을지만 알려 주면 매 turn의 context가 늘지 않는다.
- 사용자가 지우거나 고칠 수 있으면 bot이 자기 환경을 잘못 아는 상태가 생긴다. 그래서 읽기 전용이다.
