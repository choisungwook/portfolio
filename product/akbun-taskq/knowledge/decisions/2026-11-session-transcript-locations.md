---
type: Decision
title: Session transcripts stay where each runtime puts them, and Settings lists them per runtime
description: taskq does not move Claude transcripts out of ~/.claude/projects; Settings > Folders and a bot's session folder show each runtime's own store.
tags: [sessions, claude-agent-sdk, codex, kiro, ui]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-20T15:00:00Z }
---

# Session transcripts stay where each runtime puts them, and Settings lists them per runtime

## 결정

- Claude 세션 기록은 Claude Code 기본 위치(`CLAUDE_CONFIG_DIR`, 기본 `~/.claude/projects`)에 그대로 둔다.
- Codex(`~/.codex/sessions`)와 Kiro(kiro-cli 데이터 폴더의 `data.sqlite3`)도 각 CLI 기본 위치를 쓴다. API key OpenAI bot은 로컬 기록이 없고, Bedrock OpenAI bot은 `team/<bot>/.openai-history.json`에 둔다.
- 설정 > 폴더는 하나의 "세션 대화 기록" 대신 런타임별 위치를 보이고, bot의 세션 폴더 열기는 그 bot의 런타임 위치를 연다.

## 이유

- Agent SDK에는 기록 위치만 바꾸는 옵션이 없다. `sessionStore`는 원래 위치에 쓴 뒤 복사본을 하나 더 남길 뿐이다. 옮기려면 자식 프로세스의 `CLAUDE_CONFIG_DIR`을 바꿔야 한다.
- `CLAUDE_CONFIG_DIR`을 바꾸면 구독 로그인(macOS 키체인 항목이 config 폴더마다 따로 잡힘)과 task가 읽는 user settings, CLAUDE.md, skills도 함께 옮겨진다. 기록 위치 하나 때문에 로그인을 다시 하게 만드는 비용이 더 크다.
- taskq 세션은 cwd가 사용자의 작업 폴더와 달라 `~/.claude/projects` 안에서도 폴더가 겹치지 않는다. 사용자가 헷갈린 것은 저장 위치가 아니라, 화면이 모든 런타임의 기록을 Claude 폴더 하나로 가리킨 점이었다.
- 옮겨야 할 때가 오면 `CLAUDE_CONFIG_DIR`을 설정으로 두고, 처음 시작할 때 기존 taskq 세션 폴더를 옮겨 resume을 이어 가는 방식이 남아 있다.
