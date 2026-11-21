# akbun-taskq 0.10.1

bot이 쓰는 SDK와 CLI를 2026-11-18 기준 stable 버전에 맞춘다. 코드 동작은 바뀌지 않는다.

## Changed

- `@anthropic-ai/claude-agent-sdk` 0.3.325 → 0.3.327(Claude Code v2.1.327과 같은 수준). peer인 `@anthropic-ai/sdk`는 1.8.0 → 1.10.0. 0.3.328은 `next` 태그라 쓰지 않았다.

## SDK

`@anthropic-ai/claude-agent-sdk` 0.3.327:

- 0.3.327의 breaking change 2건을 taskq 코드와 대조했다. hook 이벤트 값과 matcher의 `hooks`는 배열이어야 하는데 `src/agents/claude/hooks.ts`, `src/agents/claude/team.ts`는 이미 배열을 넘긴다. Claude Code로 보낼 수 없는 option(순환·BigInt 필드)은 거부되는데 taskq는 그런 option을 만들지 않는다.
- `createSdkMcpServer()` 서버는 top-level `mcpServers`에 둔다(agent 정의의 `mcpServers`에 넣으면 0.3.327부터 무시됨). taskq의 `team` 서버는 이미 top-level이다.
- stdio MCP server를 명령줄로 넘기는 기본값(`mcpServersDelivery: 'argv'`)은 0.3.326에서 deprecated 됐다. 내장 Claude Code를 쓰므로 지금은 그대로 두고, 기본값이 바뀌는 버전에서 다시 본다.

`@openai/agents-core`, `@openai/agents-openai` 0.22.0과 `openai` 7.60.0은 이미 최신 stable이라 바꾸지 않았다.

Codex CLI 0.170.0: `@openai/codex-sdk` 0.170.0의 `codex exec` 인자 구성(`--experimental-json`, `--config`, `--sandbox`, `--cd`, `--add-dir`, `--skip-git-repo-check`, `approval_policy`, `resume <id>`)과 `turn.completed` usage 필드가 taskq가 넘기고 읽는 것과 같다.

Kiro CLI 3.5.0: 3.0.0부터 V3가 기본이지만 `--trust-all-tools`를 쓰지 않는 스크립트는 V2로 시작한다. bypass를 뺀 모든 bot은 `--trust-tools`를 쓰므로 `--v3`를 계속 붙인다. 3.5.0의 로그인 변경(`auth.portalUrl`)은 device flow 인자에 영향이 없다.

## Not verified with a real model

- 0.3.327과 Codex CLI 0.170.0, Kiro CLI 3.5.0은 가짜 SDK·CLI 테스트로만 확인했다. Kiro는 changelog로, Codex는 SDK 패키지의 인자 구성으로 대조했다.
