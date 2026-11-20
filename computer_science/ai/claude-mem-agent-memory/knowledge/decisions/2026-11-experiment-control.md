---
type: Decision
title: 메모리 비교 실험은 저장소 밖 프로젝트와 transcript 비활성화로 통제한다
description: Claude Code 자체의 기억 경로가 메모리 유무 비교를 흐리지 않게 실습 세션 조건을 고정한다.
tags: [claude-code, experiment]
generated: { by: codex/gpt-6, at: 2026-11-20T15:27:20Z }
---

## 결정

- `make up`은 실습 프로젝트를 저장소 밖의 `$LAB_DIR/park`에 만든다.
- `run_session.py`는 transcript 저장과 Claude Code 자동 메모리를 끈다. 두 비교 세션에서는 기본 도구와 MCP를 모두 끄고, minimem hook만 켜고 끈다.
- 원격 실행 환경에서 수치를 잴 때는 `CLAUDE_CODE_`로 시작하는 환경 변수를 지우고 실행한다.

## 이유

- 저장소 안에서 실행한 세션 A는 상위 `CLAUDE.md` 규칙을 따르느라 버그를 고치지 않았다.
- 기준선 세션 B가 `~/.claude/projects/`의 이전 transcript를 찾아 읽으려 했다.
- 비교 세션에 파일 읽기를 허용하면 방문객 수를 답했을 때 주입된 기록과 파일 중 어디서 숫자를 얻었는지 답변만 보고 판별하기 어렵다.
- Claude Code 2.1.327 `-p` 실행에서 프로젝트 `permissions.allow`가 적용되지 않았고 `--allowedTools`는 적용됐다.
- 원격 실행 환경 변수가 있으면 nested `claude`가 commit attribution 규칙을 컨텍스트로 받았다. 지우면 받지 않았다.
