# Agent SDK usage

Which parts of `@anthropic-ai/claude-agent-sdk` and of the OpenAI Agents SDK (`@openai/agents-core`, `@openai/agents-openai`) taskq uses, where, and why. An agent changing a backend reads this before touching SDK options; `test/docs-coverage.test.ts` fails when an option is set in code but missing here. SDK version: see `workspace/package.json`.

## Entry points

taskq calls the SDK from three places. All three run the Claude Code executable that the release binary embeds (`pathToClaudeCodeExecutable`).

| Caller | File | What one call is |
|---|---|---|
| Task worker | `src/agents/claude/worker.ts` | One `query()` per task run, in the task's working directory, with the permission profile of the task type |
| Bot turn | `src/agents/claude/team.ts` | One `query()` per bot turn, resuming the bot's session, with the bot's own settings |
| Ask | `src/agents/claude/ask.ts` | One short `query()` with no tools that returns JSON (memory proposals after a run) |
| Bot catalog | `src/agents/claude/team.ts` (`claudeCatalog`) | A session opened with an input stream that sends nothing, asked for `supportedModels()` and `supportedCommands()`, then closed: no model call |

## Functions and types

| SDK API | Where | How taskq uses it |
|---|---|---|
| `query()` | all three | Runs one session. The worker passes a string prompt; a bot turn passes an `AsyncIterable<SDKUserMessage>`, because in-process MCP tools need streaming input. The stream stays open during the turn: a message that arrives for a working bot is pushed into it (`src/team/live-input.ts`), each input carries a `uuid`; a `result` lists the inputs it answered in `user_message_uuids` (the SDK may merge inputs sent close together), and the turn ends when no input is unanswered and `queued_turn_count` is 0 |
| `createSdkMcpServer()`, `tool()` | `team.ts` | The bots' own tools (messages, tasks, discussions, wiki, memory, workflows) as an in-process MCP server named `team`. Each tool's zod shape is also checked by taskq before the handler runs |
| `HookCallback` (`PreToolUse`) | `worker/gate.ts` via `claude/hooks.ts`, `team/bot-gate.ts` via `team.ts` | The gate runs before the permission mode, and its deny holds in every mode. Task runs: path and command policy per task type, tamper stop. Bots: tamper stop (file paths and shell text), blocked commands |
| `Query.supportedModels()`, `Query.supportedCommands()` | `team.ts` | The model list (with `supportsEffort` and `supportedEffortLevels`) and slash commands for a bot's compose bar. A command of the bot's skill plugin (`taskq-<bot>-skills:<skill>`) is shown by its skill name |
| `CanUseTool` | `worker.ts`, `team.ts` | Task runs of type ops_change wait for the user's approval through it. Bots refuse at once, since nobody watches a bot's turn |
| Messages read | all three | `system`/`init` gives the session id; `result` gives `subtype`, `num_turns`, `total_cost_usd` (a running total of the session, also across a resume: a bot turn's cost is the difference to the total after the session's previous turn), `user_message_uuids`, `queued_turn_count`, `errors` and `structured_output`; an `assistant` message with `error` `authentication_failed` or `cloud_credential_error` means the model login failed |

## Options

| Option | Task worker | Bot turn | Ask |
|---|---|---|---|
| `cwd` | the task's repo or `outputs/` | the bot's workdir, else `TASKQ_HOME/team/<bot>` | the caller's folder |
| `env` | `buildEnv(config)`: provider variables and the CA bundle only | same | same |
| `pathToClaudeCodeExecutable` | the embedded Claude Code | same | same |
| `model` | `config.model` | the bot's model, else `config.model` | `config.model` |
| `permissionMode` | per task type (`profiles.ts`): `auto` or `acceptEdits`, `dontAsk`, `default` | the bot's setting, `auto` by default | `dontAsk` |
| `allowDangerouslySkipPermissions` | not set | set only when a bot's mode is `bypassPermissions` | not set |
| `allowedTools` | per task type | the bot's `team` MCP tools | not set |
| `tools` | not set (all built-in tools) | not set (all built-in tools) | `[]`, no tools |
| `canUseTool` | approval wait for ops_change | refuse with a reason | not set |
| `hooks` | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | `PreToolUse` | not set |
| `settingSources` | `['user']`, plus `project` for a trusted repo | `[]`: a bot never reads the user's Claude settings | `[]` |
| `strictMcpConfig` | `true` | `true`, `false` when the bot has plugins (their MCP servers must load) | not set |
| `mcpServers` | `{}` | `{ team }` | not set |
| `plugins` | not set | the bot's skill copy (one local plugin, `skipMcpDiscovery: true` since it has skills only) and selected plugins | not set |
| `additionalDirectories` | per task type | `TASKQ_HOME/shared`, the folder every bot shares | not set |
| `sandbox` | on, per profile | only when the bot turns it on: writes to workdir and shared folder, reads of taskq data denied, network to `allowed_domains` | not set |
| `effort` | not set | the bot's effort (`low` to `max`), else the model default | not set |
| `maxTurns`, `maxBudgetUsd` | task or config limits | the bot's limits, else the defaults in Settings | `maxTurns` 3 |
| `resume` | a resumed task run's session | the bot's session id | not set |
| `abortController` | cancel, tamper, expired login | cancel (Stop, Esc), tamper, shutdown | not set |
| `systemPrompt` | `claude_code` preset with the task rules appended | `claude_code` preset with the bot's role, roster, rules and memory appended | not set |
| `outputFormat` | `json_schema`: the worker result | not set | `json_schema` |

## What taskq does not use, and why

| SDK feature | Why not |
|---|---|
| Subagents (`agents`) | A bot is its own resumed session; work between bots goes through taskq's mailbox, which survives restarts and is visible in the UI |
| SDK memory files (`memory` on agent definitions, CLAUDE.md) | They load from Claude settings, which bots do not read. taskq keeps each bot's memory in SQLite and appends it to the system prompt |
| Session stores | Sessions stay in Claude Code's own transcript folder (`~/.claude/projects/`); Settings opens it |

## OpenAI Agents SDK

OpenAI bots (`sdk: openai`) run on `src/agents/openai/team.ts`. The hub, mailbox, team tools, guards and gate are the same as for Claude bots; only the session and the tools differ.

| SDK API | How taskq uses it |
|---|---|
| `Runner` with `OpenAIProvider({ apiKey })`, `tracingDisabled: true` | One `runner.run()` per bot turn. The key is `OPENAI_API_KEY`; tracing is off so conversations are not sent to OpenAI's trace store |
| `Agent({ name, instructions, model, modelSettings, tools })` | `instructions` is the same system text a Claude bot gets; `model` is the bot's model or `gpt-5`; `modelSettings.reasoning.effort` is the bot's effort |
| `tool({ name, description, parameters, strict: false, execute })` | The 20 team tools (zod shape turned into JSON schema with `z.toJSONSchema`) and the file and shell tools of `local-tools.ts`. A `ToolError` is returned to the model as text; a gate stop aborts the run |
| `previousResponseId`, `result.lastResponseId` | The conversation lives on OpenAI's side (Responses API). The last response id is the bot's session id; a `previous_response_not_found` error drops it so the next turn starts fresh |
| `maxTurns`, `signal` | The bot's turn limit, and cancel (Stop, Esc, disable, delete, shutdown) |
| `result.runContext.usage` | `inputTokens`, `outputTokens`, `requests`: the turn count and the cost estimate from `bots.openaiInputPerMTok` and `bots.openaiOutputPerMTok` |
| `MaxTurnsExceededError`, an error with `status` 401 | A failed turn with a reason; 401 pauses the bots like a Claude login failure |

Not used: the realtime package, handoffs between agents (bots hand work over through taskq's mailbox, which survives restarts and shows in the UI), hosted tools, and the SDK's sessions (the Responses API's own conversation state is enough). Model list: `GET https://api.openai.com/v1/models` with the key, filtered to `gpt-*` and `o*`; without a key the built-in list is shown.
