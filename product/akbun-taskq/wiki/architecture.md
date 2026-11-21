# Architecture

akbun-taskq is a personal agent task queue. One local process holds the runner, the HTTP API and the static UI. Each task runs as one Claude Agent SDK session. State lives in one SQLite file.

## Process layout

The diagram shows what runs inside the single `taskq run` process.

```text
browser UI --HTTP + SSE--> taskq process (127.0.0.1)
                            |- api/      Hono routes, SSE
                            |- runner/   claim loop, heartbeat, stale recovery
                            |- agents/   AgentBackend interface; claude/ runs one Agent SDK session per task
                            |- worker/   policy every backend enforces: gate, aws guard, prompt, result schema
                            |- memory/   similar-task lookup, retrospect, proposals
                            |- alerts/   must-check rules, desktop notifications
                            |- team/     resident role agents: hub loop, mailbox, tools, wiki (always on; Pause stops it)
                            '- db/       node:sqlite, WAL, numbered migrations
CLI (taskq add/list/...) ---- opens the same SQLite file directly
```

The macOS desktop app (`workspace/desktop/`, Tauri) is a window around that same process, not a second implementation. It starts the bundled `taskq` executable through the user's login shell (`$SHELL -ilc 'exec taskq run'`, so bots get the terminal's PATH) in `TASKQ_HOME`, or `~/.taskq` when the profile sets none, because an app opened from Finder runs in `/`, reads its output for the `taskq running at http://127.0.0.1:…` line, and moves its window to that address. Until then the bundled start page (`desktop/src/`) is shown; if taskq ends without printing the address, that page shows taskq's last 20 lines. Closing the app sends taskq SIGTERM and kills it after 5 seconds. The taskq page is a remote origin for the app and has no access to the app's commands. A link that opens a new window goes to the default browser and a download is saved to `~/Downloads` (`open_window` in `desktop/src-tauri/src/lib.rs`); the UI asks yes/no questions through `ui/js/core/ask.js` because a webview shows nothing for `confirm` and `prompt`. The pure parts (the ready line, the shell choice) live in the `taskq-launch` crate so they test without Tauri.

## Stack

| Part | Choice | Why |
|---|---|---|
| Runtime | Node 24, TypeScript run by type stripping | No build step. `tsc --noEmit` only checks types |
| Storage | `node:sqlite` (WAL, FTS5) | Built in, no native addon. Atomic claim needs a real transaction |
| HTTP | Hono + `@hono/node-server` | Small router, SSE helper |
| Agent | `@anthropic-ai/claude-agent-sdk` | Sessions, permissions, hooks, sandbox |
| UI | Static ES modules in `ui/`, no framework, no build | Served by the API as files |
| UI theme | Astryx design tokens behind a token contract, IBM Carbon patterns | See "UI theme" below |
| Tests | `node:test` with a fake worker | CI needs no credentials and no model call |

Type stripping rules: import with the `.ts` extension, no `enum`, no parameter properties, no namespaces. `tsconfig.json` sets `erasableSyntaxOnly`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `noEmit`, `strict`.

## Directory layout

```text
workspace/
  package.json  tsconfig.json  taskq.config.example.json  .gitignore
  bin/taskq                 # #!/usr/bin/env node, imports src/cli/main.ts
  desktop/                  # macOS app (Tauri): src/ start page, src-tauri/ shell, src-tauri/crates/launch pure crate
  src/
    config.ts               # load taskq.config.json + env, defaults
    types.ts                # shared types (below)
    mask.ts clip.ts         # secret masking (the only path into persisted text); string clipping for events
    db/
      open.ts               # open, pragmas, file modes, run migrations
      schema/001_init.sql   # numbered migrations: 001_init, 002_approvals, 003_access_skills
      tasks.ts runs.ts events.ts alerts.ts proposals.ts stats.ts approvals.ts access-skills.ts   # queries, one file per table
      operator.ts           # pause reason, cancel and retry transitions that span tables
    runner/
      runner.ts             # loop: preflight, recover, claim, spawn
      claim.ts              # eligibility query + atomic claim
      execute.ts            # one run: heartbeat, approval wait, finish
      finish.ts             # outcome -> task status, alerts, follow-ups, review task
    alerts/
      rules.ts              # outcome/event -> alert rows
      notify.ts             # macOS and Windows notifications
    agents/
      types.ts              # AgentBackend: createWorker, preflight, ask
      index.ts              # registry: config.agent -> backend
      claude/               # the Claude Agent SDK backend
        index.ts worker.ts hooks.ts profiles.ts auth.ts ask.ts result.ts
    worker/                 # backend-neutral policy
      gate.ts paths.ts aws-guard.ts filter-args.ts prompt.ts result-schema.ts text.ts
    memory/                 # phase 2
      similar.ts retrospect.ts
    team/                   # resident agent team, see "Team"
      types.ts              # TeamBackend: runTurn
      hub.ts roster.ts prompt.ts report.ts owner.ts search.ts wiki-files.ts
      tools.ts tools-talk.ts tools-tasks.ts tools-wiki.ts
    skills/                 # access skill registry: validation, discovery, run-time check
      inspect.ts registry.ts discover.ts frontmatter.ts
    api/
      server.ts             # bind 127.0.0.1, host/origin guard, token, static ui
      auth.ts guard.ts      # x-taskq-token check; Host, Origin and Content-Type checks
      routes-tasks.ts routes-runs.ts routes-alerts.ts routes-approvals.ts routes-misc.ts routes-settings.ts sse.ts
    cli/
      main.ts               # parseArgs dispatch
      commands.ts           # add list show resume done alerts log run
      approvals.ts          # approve and deny: prints the exact input, asks on a TTY
      operator.ts           # pause, unpause, cancel, retry
      skills.ts             # skills list, add, remove, discover (same checks as the API)
  ui/                       # index.html, css/, js/*.js (phase 3)
  memory/                   # fact memory markdown, tracked by git
  data/                     # taskq.db, ignored
  outputs/                  # research and review documents, ignored
  test/
```

No source file exceeds 300 lines. When one grows past that, split it by responsibility.

## Shared types

These are the contracts between modules. `src/types.ts` holds them verbatim.

```ts
export type TaskType = 'ops_read' | 'ops_change' | 'code' | 'research' | 'security_review'
export type TaskStatus = 'draft' | 'ready' | 'running' | 'needs_approval' | 'needs_auth' | 'review' | 'done' | 'failed'
export type Outcome = 'done' | 'failed' | 'needs_approval' | 'needs_auth' | 'review' | 'stale'
export type Severity = 'critical' | 'high' | 'normal'
export type AlertKind = 'approval_required' | 'security_finding' | 'prod_touch' | 'worker_flag'
  | 'auth_required' | 'failed' | 'stale_repeat' | 'budget_exceeded' | 'review_ready' | 'proposal_pending'
export type EventKind = 'claimed' | 'tool_call' | 'tool_result' | 'permission_request' | 'approved' | 'denied'
  | 'auth_required' | 'progress' | 'error' | 'finished' | 'cancel_requested' | 'tamper_blocked'

export interface TaskData {
  title?: string
  intent: string
  cautions?: string
  access_skill?: string      // name of the user's own skill that logs in to the target account
  target_profile?: string    // AWS profile for target-account commands
  repo?: string              // cwd for code tasks
  output_path?: string       // under outputs/
  review_of?: string         // security_review: id of the code task
  base_commit?: string       // code: HEAD before the run
  max_turns?: number
  max_budget_usd?: number
}

export interface Task {
  id: string; type: TaskType; status: TaskStatus; priority: number
  lock_key: string | null; claimed_by: string | null; heartbeat_at: number | null
  session_id: string | null; data: TaskData; created_at: number; updated_at: number
}

export interface RunStats { turns?: number; input_tokens?: number; output_tokens?: number; cost_usd?: number; tool_calls?: number }

export interface WorkerResult {
  outcome: Outcome
  summary: string                                   // 1-3 lines
  stats: RunStats
  alerts: { severity: Severity; message: string }[] // items the user must check
  followups: { type: TaskType; intent: string }[]
  budget_exceeded?: boolean
  auth_scope?: 'target' | 'inference'               // set when outcome is needs_auth
  tampered?: boolean                                // the gate stopped a call that reached taskq itself
}

export interface SimilarTask { task_id: string; text: string }   // a finished run that shares words with the task

export interface TaskHandoff {
  id: number
  task_id: string
  run_id: string | null
  output_path: string | null
  summary: string | null
  accepted_via: 'auto' | 'manual'
}

export interface WorkerContext {
  task: Task
  runId: string
  resumeSessionId: string | null
  similar: SimilarTask[]                                          // up to 3, from memory/similar.ts
  handoffs: TaskHandoff[]
  access_skill_path?: string                                      // registered folder of task.data.access_skill
  signal: AbortSignal
  emit(kind: EventKind, payload: Record<string, unknown>): void   // masked and stored by the runner
  onSession(sessionId: string): void                              // stored on tasks and runs
  patchData(patch: Partial<TaskData>): void
  requestApproval(req: { tool: string; input: unknown; reason?: string }): Promise<boolean>
}

export type Worker = (ctx: WorkerContext) => Promise<WorkerResult>
```

The runner owns every database write. A worker only talks through `WorkerContext`, which is why tests can inject a fake worker.

## Schema

`001_init.sql` creates these tables, `002_approvals.sql` adds the approval table below, and `003_access_skills.sql` adds the access skill registry (see Access skills). Times are UTC epoch seconds. The UI renders them in the browser time zone.

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  lock_key TEXT, claimed_by TEXT, heartbeat_at INTEGER, session_id TEXT,
  data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX tasks_status ON tasks(status, priority DESC, created_at);
CREATE TABLE deps (
  task_id TEXT NOT NULL, depends_on TEXT NOT NULL, kind TEXT NOT NULL,  -- blocks | discovered_from
  PRIMARY KEY (task_id, depends_on));
CREATE TABLE runs (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, session_id TEXT,
  started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, summary TEXT, stats TEXT);
CREATE INDEX runs_time ON runs(started_at);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id TEXT,
  ts INTEGER NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL);
CREATE INDEX events_task ON events(task_id, id);
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, run_id TEXT,
  severity TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL,
  created_at INTEGER NOT NULL, acked_at INTEGER);
CREATE TABLE proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, kind TEXT NOT NULL,  -- memory | skill
  target_path TEXT NOT NULL, diff TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- queue_paused, pause_reason, pause_by (user | preflight), cancel:<task id>
CREATE VIRTUAL TABLE history_fts USING fts5(task_id UNINDEXED, run_id UNINDEXED, body);
```

`history_fts` gets one row per finished run: intent plus summary. `PRAGMA user_version` tracks which numbered migration files have run.

Migration `002_approvals.sql` adds the approval table and the alert's request reference. `decision` is `approved`, `denied` or `expired`, and NULL while the request is open. `input` is the exact tool input as JSON, and it is NULL once the request is closed.

```sql
CREATE TABLE approvals (
  request_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, tool TEXT NOT NULL,
  input TEXT, created_at INTEGER NOT NULL, decision TEXT, decided_at INTEGER);
ALTER TABLE alerts ADD COLUMN ref TEXT;  -- request_id of an approval_required alert
```

`003_access_skills.sql` adds the registry of access skills. `path` is the realpath of the skill folder.

```sql
CREATE TABLE access_skills (
  name TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, description TEXT, added_at INTEGER NOT NULL);
```

## Task states

```text
draft -> ready -> running -> done
                     |-> needs_approval   waiting for the user's decision on a change command
                     |-> needs_auth       target account needs a browser login
                     |-> review           the user reads the output and marks it done
                     '-> failed

failed -> ready | draft             retry (API or CLI); the claim is cleared, the session only when asked
running | needs_approval | needs_auth -> failed   cancel (API or CLI); see "Pause, cancel and retry"
```

- `blocked` is computed on read: a task with an unfinished `blocks` dependency.
- A `running` or `needs_approval` task whose `heartbeat_at` is older than the TTL (default 300 s) goes back to `ready`, its open run closes with outcome `stale`, and the next claim resumes `session_id`. A task with a cancel marker is closed as cancelled instead.

## Runner

The loop does not tick on a fixed short interval. It waits on `queueChanged` (`src/wake.ts`) for up to `pollSec` (default 60 s). Every successful non-GET API request, every run that ends and every run-now request notifies it, so a change made in this process is looked at at once. A change written by the CLI, which is another process, is picked up when the wait times out. Approval waits and the SSE stream wait the same way on `eventWritten`, which `insertEvent` notifies. Each waiter reads the signal's generation before it reads the database and passes it to `wait`, so a notify that arrives while it is busy (a tick awaiting preflight, an SSE write) makes the next wait return at once instead of being lost.

1. Preflight inference auth (see Providers). On failure set the queue pause with `pause_by = preflight` and raise `auth_required`. While the queue is paused, the tick re-runs the preflight once a minute and a passing check lifts only a preflight pause.
2. On start, recover every `running` and `needs_approval` task as stale. On each tick, recover `running` and `needs_approval` tasks whose `heartbeat_at` is older than the TTL. A NULL heartbeat is never recovered by the tick.
3. Pick `ready` tasks by priority once every blocking prerequisite is done and its current handoff is accepted.
4. Claim atomically. The update repeats the eligibility checks, including the lock key and queue pause. The same transaction loads the accepted handoff records for the worker.
5. Limit concurrency to `maxConcurrent` (default 3). Tasks asked for with run now (`runner.runNow`) are claimed before the priority order.
6. Create the `runs` row, call the worker, update `heartbeat_at` every 30 s, then finish. Before the worker is called, a task with an `access_skill` resolves it to the registered path. A missing registration or a missing `SKILL.md` finishes the run as `failed` with the summary `access skill <name> is missing at <path>`, and no session starts.

### Handoffs

When a blocking prerequisite reaches `done` or a dependency is added to an already completed task, SQLite records the run ID, masked summary, output path, receipt time and acceptance. The output path comes from the run's start so later task edits cannot redirect an existing handoff. The receiving task defaults to automatic acceptance. Manual mode leaves the row pending. The worker receives the accepted record ID and method and reads artifacts through the existing file policy.

One prerequisite run produces at most one handoff per dependent task. A newer run supersedes the earlier record. The same transaction writes an event and a durable alert. The runner claims each desktop notification once, including while paused. CLI task creation and Mark done can also send pending notifications. The migration records completed dependencies from existing databases without replaying desktop alerts.

### Approval

`requestApproval` inserts an `approvals` row that holds the exact tool input, and writes a `permission_request` event with the masked, clipped copy (`request_id`, `tool`, `input`, `reason`, `bytes`). It then sets the task to `needs_approval` and raises `approval_required` with `ref` set to the request id. The wait loop reads that row's `decision` whenever an event is written in this process (a decision through the API writes `approved` or `denied`) and otherwise every `pollSec`, so a `taskq approve` from the CLI is seen within a minute. A denied or expired request returns false to the worker.

- `decideApproval(db, taskId, requestId, approve)` answers only the task's single open request. Any other `request_id` throws `ApprovalError`, which the API maps to 409. In one transaction it writes the decision, clears `input`, writes the `approved` or `denied` event, and acknowledges the task's open `approval_required` alerts. The API and the CLI both call this function.
- Ending a run (`endRun`) and stale recovery mark the open rows of that run or task as `expired` and clear `input`.
- Requests from one run are serialized: a second `requestApproval` waits until the first is answered. Recovery acknowledges the open `approval_required` alerts. If the process dies while waiting, the task is recovered as stale and the resumed session asks again.
- The `approval_required` message is `Approval needed: <tool>:` followed by the first 120 characters of the masked command. The macOS notification is titled `taskq · <task id>` and ends with `taskq approve <task id>` (`resume` for `auth_required`, `show` for `security_finding`); the command part is cut to fit the 200-character limit.

The exact input is stored unmasked and unclipped, and only while the request is open, because a masked or clipped copy can hide the part that runs. A shell comment such as `aws s3 ls # -----BEGIN PRIVATE KEY-----` makes the masking rule redact the rest of the line, so the masked view reads `aws s3 ls` while `aws iam delete-user` is the command that runs. The decision record in `knowledge/decisions/` has the full reasoning.

### Run now

`POST /tasks/:id/run` (`prepareRun` in `src/db/operator.ts`) makes the task `ready`, writes a `run_requested` event, and calls `runNow` on the runner of this process, which claims it before other ready tasks as soon as a slot is free.

| From | Session | Alerts acknowledged |
|---|---|---|
| `draft`, `ready` | kept | none |
| `needs_auth` | kept, as Resume | `auth_required` |
| `failed` | new | `failed`, `budget_exceeded` |
| `review` | new | `review_ready` |
| `done` | new | none |

`running` and `needs_approval` return 409. A paused queue and an unfinished `blocks` dependency return 409 without changing the task. A lock key held by another task leaves it `ready` and first in line until the lock frees. A requested task that is no longer `ready`, or whose `blocks` dependency stopped being done, is dropped from the run-now list.

### Pause, cancel and retry

These are operator actions. The API, the CLI and the UI each call the functions in `src/db/operator.ts`.

- **Pause.** `POST /queue/pause` with an optional `{ "reason" }` (up to 200 characters, masked, default `paused by user`) sets `queue_paused`, `pause_reason` and `pause_by = user`. Running tasks continue. Nothing new is claimed. Only `POST /queue/resume` lifts a user pause. A passing preflight lifts a preflight pause and nothing else.
- **Cancel.** `POST /tasks/:id/cancel` and `taskq cancel <id>` are valid in `running`, `needs_approval` and `needs_auth`, and return 409 otherwise. The request writes a `cancel_requested` event. If a live runner owns the task (heartbeat inside the TTL), the request also writes the marker `cancel:<task id>` in `meta`. The runner polls the marker on each tick and aborts the worker through its AbortSignal. Then `executeRun` closes the run with outcome `failed` and summary `cancelled by user`, expires any open approval (its input is removed), sets the task to `failed`, acknowledges the open `approval_required` alerts, writes a `finished` event with `cancelled: true`, and raises no `failed` alert. Without a live owner (`needs_auth`, or a stale heartbeat), the API or CLI runs the same close at once. Stale recovery also closes a marked task instead of returning it to `ready`.
- **Retry.** `POST /tasks/:id/retry` and `taskq retry <id>` apply to `failed` only (409 otherwise). Body `{ "draft": true }` returns the task as a draft, not as ready. The claim and heartbeat are cleared. The session is cleared unless the body says `{ "resume": true }`. The open `failed` and `budget_exceeded` alerts are acknowledged, and any leftover cancel marker is removed.

### Finish

| Worker result | Task status | Alerts |
|---|---|---|
| `done`, type research or security_review | `review` | `review_ready` |
| `done`, other types | `done` | none |
| `failed` | `failed` | `failed`, plus `prod_touch` when `lock_key` is in `prodLockKeys` |
| `needs_auth` | `needs_auth` | `auth_required` |
| `budget_exceeded` | `failed` | `budget_exceeded` |
| `tampered` (the gate stopped the run) | `failed` | `security_finding` only |
| any `alerts[]` item, at the severity the worker reported | unchanged | `worker_flag` |
| `needs_approval` (invalid as a final answer) | `failed`, summary "worker returned an invalid outcome" | `failed` |
| `stale` | `ready` | `stale_repeat` from the second consecutive stale run, counted since the last run that did not end stale |

Every finished run writes a `finished` event with its outcome. `finishRun` writes the run close, the task status, the alerts and the follow-ups in one transaction, and only while the runner still holds the claim: `endRun` and `releaseTask` take the runner id, so a late finisher whose claim was recovered writes nothing.

After a `code` task finishes `done`, the runner creates a `security_review` task with `review_of` set and a `discovered_from` dependency. When that review returns a critical alert, the runner sets the original task to `review` and raises `security_finding`. Each `followups[]` entry becomes a `draft` task with a `discovered_from` dependency.

## UI theme

The UI reads its colors, shapes and type through a token interface, the same way agents sit behind `AgentBackend`. The decision is [Astryx tokens](../knowledge/decisions/2026-11-astryx-design-system.md); the sidebar layout comes from [the sidebar where bots read like chats](../knowledge/decisions/2026-11-soft-theme-sidebar.md).

- `ui/css/theme/contract.css` names every token component CSS may read (surfaces, text, interaction, notification washes, status colors, bot avatar colors, shape, motion, type). Each is `initial` there.
- `ui/css/theme/astryx.css` is the theme `index.html` loads: the values of Meta's Astryx neutral theme (MIT, `LICENSE-astryx.txt` beside it), dark with a light variant, a monochrome accent, blue only for links and focus, 12 px containers, 10 px elements, 6 px inner parts. Astryx itself is React with StyleX; only its tokens are carried over. `ui/css/theme/soft.css` (the previous theme) stays as another implementation. The font family and size in Settings override `--font-sans`, `--text-body` and `--text-small` on `:root` at run time; sidebar and chat sizes are in `em` so they follow. `ui/css/theme/carbon.css` is the earlier IBM Carbon theme (Apache-2.0, `LICENSE-carbon.txt` beside it), kept as a second implementation; swapping the `<link>` in `index.html` switches back.
- `test/ui-tokens.test.ts` fails when a component reads a token outside the contract or a theme leaves one out. Every theme file is in its list.
- Layout: a left sidebar (`css/nav.css`) holds the views (no Proposals, Goals or Discussions views: those stay in the API and CLI), the bots list (orchestrator first, a gear on each bot, a right-click menu, and `+` to add one) and the shared views; `<main>` shows one view; Must check is a bell at the foot of the sidebar whose panel opens over the page (normal alerts are not listed). The bot conversation, shared folder and wiki views are in `css/chat.css`. `ui/js/core/nav.js` switches views and emits `tab` (view name) and `bot` (bot name).
- Icons come from `ui/js/core/icons.js`, one SVG line set (24 px grid, 1.8 stroke, currentColor); markup asks with `data-icon` and `paintIcons()` fills it at start. Status is a tinted 1 px ring and a wash, never a stripe down one side. `base.css` themes the browser surfaces (selection, caret, scrollbars, `accent-color`, tabular numerals). The bell and Settings sit at the foot of the sidebar.
- Component patterns kept from Carbon: inline notifications that never dismiss on a timer, danger buttons that need a second click, status indicators that pair a symbol and a word with color, one primary button per view.

## Agent backends

`config.agent` picks the backend (default `claude`). `src/agents/index.ts` maps the name to an `AgentBackend`, and `src/cli/run.ts` is the only runtime caller (`scripts/demo-seed.ts` also calls `preflight`): the runner gets `createWorker(config)` and `preflight(config)`, and the retrospector gets `ask(config, request)`. The runner, API, database and UI never import an SDK.

| Method | Contract |
|---|---|
| `createWorker(config)` | Returns the `Worker` the runner calls once per run. Every tool call goes through `decide` and `tamperOf` in `src/worker/gate.ts`; a call `tamperOf` names aborts the run with `tampered: true`. The final answer follows `RESULT_SCHEMA`. A failed model login returns `needs_auth` with `auth_scope: 'inference'` |
| `preflight(config)` | Checks the model login before claims. A failure pauses the queue |
| `ask(config, { prompt, schema, cwd })` | One short call with no tools that returns JSON matching `schema`, or `undefined` |

Adding a backend: put it under `src/agents/<name>/`, add the name to `AgentName` in `types.ts`, to `BACKENDS` in `index.ts` and to `AGENTS` in `config.ts`. `test/agents.test.ts` checks that every registered backend has the three methods. The policy, the prompt and the result schema in `src/worker/` are shared; what a backend writes itself is the mapping from its SDK's tool-call hook and permission model to `decide`, which is what `claude/hooks.ts` and `claude/profiles.ts` do for Claude.

## Bots

Bots are resident agent sessions with a role, on the Claude Agent SDK or the OpenAI Agents SDK (chosen per bot). Tasks are the user's notes of work; a bot takes a task it owns, works on it in its own session and closes it. The run button on a task is separate: a one-off run that belongs to no bot. The UI, CLI (`taskq bots`), API (`/api/bots`) and config key (`bots`) call them bots; the code (`src/team/`), tables (`team_*`) and wake signal (`teamChanged`) call them the team. The design records are [bots execute tasks](../knowledge/decisions/2026-11-bots-execute-tasks.md), [resumed sessions and the mailbox](../knowledge/decisions/2026-11-resident-agent-team.md), [ownership and discussions](../knowledge/decisions/2026-11-task-ownership-and-discussions.md), [wiki search](../knowledge/decisions/2026-11-wiki-hybrid-search.md), [workflows](../knowledge/decisions/2026-11-workflows-run-by-bots.md), [OpenAI bots](../knowledge/decisions/2026-11-openai-bot-backend.md) and [operations for the CLI and MCP](../knowledge/decisions/2026-11-operations-for-cli-and-mcp.md). They always run with taskq (there is no off switch since 0.12.0; an old `bots.enabled` is ignored); Pause in the menu stops them; there is no usage limit since 0.26.0.

```text
user --bot chat / taskq bots say--> team_messages --hub--> bot turn (resumed Claude session in its workdir)
                                         ^                   |- team tools: messages, tasks (start/finish), discussions, wiki
                                         |                   |- built-in tools, per the bot's permission mode, sandbox and gate
                                         |                   '- skills and plugins from the bot's snapshot
                  a task run by the run button reports to the task's owner
```

| Part | What it does |
|---|---|
| `team_agents` | One row per bot: role, description (what others delegate by), instructions, `may_message_user`, `enabled`, `system` (the orchestrator), `permission_mode` (default `auto`), `sandbox` (default off), `allowed_domains`, `blocked_commands` (default none), `workdir`, `skills`, `plugins`, `model`, `effort`, `sdk` (`claude` or `openai`), per-bot limits, `memory`, `session_id` (a Claude session id, or an OpenAI response id). Listed with `system` first |
| Orchestrator | `taskq`, created on first start from `team/roster.ts`. It may message the user, cannot be deleted or disabled, and is pinned first in the sidebar. Every other bot is created by the user. The UI asks only for a name, a description and the SDK (with the sign-in for OpenAI); the rest starts with defaults and is edited in the bot's settings. The CLI and the API still take a preset (planner, coder, reviewer, doc-reviewer) |
| `bot_skills`, `bot_plugins` | The global registry (Settings). A skill is a folder with `SKILL.md`; a plugin is a folder with `.claude-plugin/plugin.json`. Removing an entry takes it off every bot |
| `team_messages` | Mailbox. `sender` and `recipient` are bot names, `user` or `queue` (a run's report). `deliver_at` holds a message back until that time. A turn claims every deliverable message of one bot (`turn_id`, `read_at`, `attempts`) |
| `team_turn_steps` | One row per tool call a bot made in a turn (tool, short masked detail), so its conversation shows what it did between messages. Never pruned |
| `team_turns` | One row per bot turn with outcome, cost, session id and `writes` (tool calls with an effect). An open row means the bot is busy |
| `tasks.owner`, `tasks.owner_since` | The one bot that owns a task, and since when. NULL is the user's own task |
| `runs.bot` | Set on a run a bot did in its own session; NULL on a run from the queue or the run button |
| `team_threads` | Discussions: moderator, ordered participants, rounds, `posts`, status `open`, `concluding`, `closed` |
| `wiki_pages`, `wiki_revisions`, `wiki_fts` (trigram), `wiki_links` | Shared memory. `writePage` needs the revision the writer read; a stale write returns the current page. `[[slug]]` references are stored as links |
| `team/hub.ts` | Waits on `teamChanged`, the next `deliver_at`, or `pollSec`. For each enabled bot with deliverable mail, no open turn and no failed turn in the last 60 s, up to `bots.maxConcurrentTurns`, checks the guards, opens a turn and calls `TeamBackend.runTurn` with the bot's workdir and plugin folders |
| `team/tools*.ts` | SDK-neutral tool handlers, each input checked against its zod schema. `tools-talk.ts`: messages and discussions. `tools-tasks.ts`: create, assign, start, finish, list, read tasks. `tools-wiki.ts`: list, search, read, write (and mirror) |
| `team/bot-work.ts` | `start_task`: only the owner, only a ready task (or a draft that touches no account) whose blocking dependencies are done; sets running with `claimed_by = 'bot:<name>'` and opens a run with `bot`. `finish_task`: closes the run, sets done, review or failed, raises the failed or review alert. On start, a task a bot had running goes back to ready and the bot gets a message |
| `team/bot-gate.ts` | Always: a call that reaches taskq's data directory, config, a bot's browser profile (`TASKQ_HOME/browser`, by shell text including `~`, `$HOME` and `$TASKQ_HOME` spellings, or by a file tool's path or pattern through `tamperOf`, for task workers too), Claude Code settings (write) or turns the sandbox off ends the turn and pauses the bots (`security_finding`). A shell command that looks for or talks to a DevTools endpoint (`DevToolsActivePort`, `:<port>/json`, `devtools/page/`, `Input.dispatchMouseEvent`, `connectOverCDP`, `browserWSEndpoint`, …) is refused, so the browser is reached only through the gated browser tools; `remote-debugging` alone is not matched, so searching code for it still works. Per bot: a Bash command whose whole text or any segment of a pipeline or list matches a `blocked_commands` pattern (`*` is the only wildcard) is refused |
| `team/bot-plugin.ts` | Copies every registered skill into one local plugin per bot (`bot-plugins/<bot>/skills-plugin/skills/<name>`, loaded with `skipMcpDiscovery`) and, for a Claude bot, every registered plugin into `bot-plugins/<bot>/plugins/<name>`. A bot does not pick: `getAgent`/`listAgents` fill `skills`, `plugins` and `mcp_servers` from the registries (`src/db/team.ts`), and the stored per-bot lists are not read. The copies live outside the bot's folder and the gate stops any write to them, because a plugin a bot could edit would run hooks and MCP servers outside its tool calls. Saving settings, Reload, and registering, removing, installing or updating an entry (for every bot it applies to) rebuild the copy; a turn loads the copy, so a skill edited on disk reaches the bot at the next Reload, not mid-work. `node_modules` and `.git` are not copied |
| `team/search.ts`, `team/wiki-files.ts` | Wiki search (below) and the markdown mirror under `TASKQ_HOME/wiki/` for folder tools such as graphify |
| `team/report.ts` | Inside `finishRun`'s transaction, posts a queue run's outcome to the task's owner. The automatic security review of a bot's code task is created owned by the first enabled reviewer, else the orchestrator, never the author, and that bot is told |
| `team/live-input.ts` | The input stream of a running Claude turn. The hub pushes messages that arrive meanwhile into it (`joinTurn` marks them on the same turn); the turn ends when every message has its result |
| `team/catalog.ts` | The compose bar's models, effort levels, permission modes and slash commands for one bot: the backend's `catalog()` (cached 10 minutes, `?refresh=1` asks again), else a built-in list marked `fallback` |
| `workflows`, `workflow_runs`, `workflow_steps`, `db/workflows.ts`, `team/workflow-work.ts` | Workflows, below |
| `agents/openai/team.ts`, `agents/openai/local-tools.ts` | OpenAI bots, below |
| `agents/claude/team.ts` | `query()` with `resume`, `cwd` = the bot's workdir, `permissionMode` from the bot (`bypassPermissions` also sets `allowDangerouslySkipPermissions`), `sandbox` only when the bot has it on (writes limited to the workdir, reads of taskq's data and config denied, network to `allowed_domains`), `plugins` from the snapshot, `settingSources: []` so the user's own Claude settings never apply, `strictMcpConfig` unless the bot has plugins, the in-process MCP server `team`, the gate as a PreToolUse hook, and a `canUseTool` that refuses anything that would wait for an approval, since nobody watches a bot's turn |

### Bot tools

| Tool | What it does |
|---|---|
| `list_agents` | the enabled bots with role, description and whether each is busy |
| `browser_open`, `browser_read`, `browser_click`, `browser_type`, `browser_screenshot` | the bot's own headless Chrome (`src/browser/`), the one its conversation shows on the right: open an http(s) page, read its text and controls (each tagged `e1`, `e2`, … for click and type), click, type (optionally Enter), save a PNG into the shared folder under `browser/`. taskq starts the installed Chrome, Chromium, Edge or Brave (`TASKQ_CHROME` overrides) with `--remote-debugging-port=0` and profile `TASKQ_HOME/browser/<bot>`; every process reaches it through the profile's `DevToolsActivePort`, so a Codex or Kiro bot's `taskq mcp --bot` drives the same browser. Chrome runs under a `/bin/sh` watcher that ends it within 2 s of its owner exiting; the owner is the `taskq run` server, whose pid the one-turn MCP process gets as `TASKQ_OWNER_PID`, so the page outlasts a turn. CDP goes over Node's WebSocket, one connection per call. Looking (`GET /bots/:name/browser`, the screen) never starts Chrome. `taskq run` closes the browsers when it stops. Click and type pass a gate (`tools-browser.ts`), as Claude Desktop asks: on a site not in the bot's allowed list (`meta` `browser_sites:<bot>`) the action does not run and a `browser_site` request waits in Must check ("Allow this site" adds the host for good); sites are host and port, so allowing one local dev server does not allow every port; on an allowed site, a click whose label or link path matches `IRREVERSIBLE_ACTION` (buy, pay, send, publish, delete, … in English and Korean), and Enter in a textarea or editable box or in a field whose label or form submit button matches, waits for a one-time `browser_action` approval of that action named by label and page, usable for 15 minutes after the user decides; a password field is always refused. The way around it, a shell reaching the DevTools port, is narrowed by the bot gate (the profile stops the turn, DevTools commands are refused) and, with the sandbox on, by `denyRead` on `TASKQ_HOME/browser`. The gate is a text check; the sandbox is the boundary. Opening and reading are not gated. The user's own clicks in the pane are not gated |
| `csv_read`, `csv_write`, `xlsx_read`, `xlsx_write`, `xlsx_set_cells`, `pptx_read`, `pptx_replace_text`, `pptx_add_slide`, `pptx_create` | CSV, Excel and PowerPoint files (`src/office/files.ts`). An absolute path is the file the user named, and the bot keeps working on it; a relative path is a file in the shared folder, created when missing (`..` out of it is refused). Excel goes through exceljs, which keeps formatting when `xlsx_set_cells` edits cells. An existing deck is edited in its own XML with jszip (text replaced inside one run, a slide copied with its layout and pictures and without its notes), so its design stays; `pptx_create` builds a new deck with pptxgenjs and refuses an existing file without `overwrite`. These tools write from the taskq process, outside Claude Code's sandbox, so a bot with `sandbox` on may use only the shared folder here |
| `send_message` | a message to a bot, or to the user: always for a bot the user has written to (it answers directly), otherwise only with `may_message_user`, which governs conversations the bot would start; `deliver_at` schedules it; `files` hands over files in the shared folder (stored as paths relative to it, the user opens them from the message; anything outside is refused) |
| `start_discussion`, `discuss`, `conclude_discussion` | bounded discussions, below |
| `create_task`, `assign_task` | record a task with an owner; hand it on |
| `start_task`, `finish_task` | work on an owned task within one turn |
| `list_tasks`, `get_task` | read tasks and their last run |
| `wiki_list`, `wiki_search`, `wiki_read`, `wiki_write` | the shared wiki |
| `memory_write` | replace or append to the bot's own memory, which is appended to its system prompt every turn (16,000 characters at most) |
| `write_handover` | only after taskq said the conversation is ending: save the note the bot's next session starts from (7,500 characters at most) |
| `list_workflows` | the workflows (name, steps) and the bot's own runs still going |
| `run_workflow` | starts a run of a workflow that the bot itself executes, without a task |
| `workflow_status` | the steps of a run with their state (ready, running, succeeded, failed, skipped), the run status, and whether the workflow was deleted |
| `close_goal` | the orchestrator closes a goal as done or dropped with a summary; the user is told |
| `workflow_step` | reports one step: `running`, then `succeeded` (a `check` step needs `evidence`; an `approval` step only the user can approve), `failed` or `skipped` (with the reason). A failed step fails the run; the run succeeds when every step is done |

### Messages to a working bot

A message never waits for the bot to answer the sender. It lands in `team_messages`; if the bot has no open turn, the hub starts one. If a Claude bot is working, the hub's next tick takes the new messages into the running turn (`joinTurn`, at most 20 at once and 10 times per turn) and pushes them into the session's input stream, the way Claude Code takes a message typed mid-turn. Past 10 joins the messages wait for the next turn, which waits for a free slot under `maxConcurrentTurns` like any other. An OpenAI bot has no streaming input, so its messages wait for the next turn. `GET /bots` reports `queued` per bot: deliverable messages no turn has taken; the conversation and the sidebar show it.

### Compose bar and slash commands

Under a bot's input: a refresh button (reload the bot's skills and plugins, then read the catalog again) and menus for model, effort and permission mode (`GET /bots/:name/catalog`, saved with `PUT /bots/:name`, applied from the next turn). Typing `/` lists the bot's commands: its registered skills and, for Claude bots, the commands the SDK reports for its plugins. The bot's system prompt says that a user message starting with `/name` asks it to run that skill.

### Workflows

A workflow is a named graph of steps (`kind`: `do`, `check`, `handoff` to a named bot, `approval` by the user; `needs` lists the steps that come first; no loops). The Workflows view edits it as a left-to-right graph like n8n and keeps the run history like Argo. A run copies the definition (`snapshot`), records the bot that executes it and the task if any, and has one row per step.

- Start: a bot that `start_task`s a task with `data.workflow_id` starts the run (or continues the one left from an earlier turn) and gets the steps in the tool answer; `POST /workflows/:id/run` or the bot's `run_workflow` starts one directly. The queue does not run a task that has a workflow and no owner: only a bot executes workflows.
- Progress: the bot reports steps with `workflow_step`. taskq refuses a step whose `needs` are not done, a `check` without evidence, and an `approval` the bot tries to close itself.
- Success: decided by taskq, not the bot. One failed step fails the run (the rest are skipped); every step succeeded or skipped succeeds it. `finish_task` with done or review is refused while the task's run has not succeeded; failed ends the run as failed.
- Approval: the user answers in the run view, `taskq workflows approve` or `POST /workflow-runs/:id/steps/:step/approve`; the bot is told.
- Delete: soft (`deleted_at`). Runs keep their snapshot and show the workflow as deleted (`workflow_deleted`); a bot running it gets a message. A cancelled run tells its bot too.

### OpenAI bots

A bot with `sdk: openai` runs on `agents/openai/team.ts` with the same hub, mailbox, team tools, limits and gate. The Responses API keeps the conversation; the bot's `session_id` is the last response id and the next turn passes it as `previousResponseId`. The SDK has no permission modes and no auto mode, so the mode picks the tools taskq gives it: `plan` gets `read_file` and `list_dir`, `acceptEdits` adds `write_file` (only inside its workdir and the shared folder), `bypassPermissions` adds `shell` unless its sandbox setting is on. Every call goes through `botGate` like a Claude tool call. A turn's cost is estimated from token usage and `bots.openaiInputPerMTok` and `bots.openaiOutputPerMTok`. It needs `OPENAI_API_KEY` in taskq's environment; without it the turn fails with that message and the messages are retried, then set aside.

### Wiki export and import

Both run as background jobs (`src/jobs/`): the taskq process runs one job at a time, a job reports each step with progress and a checkpoint and yields to the event loop between steps (so the API and the bots keep answering), and a cancel asked by the user stops it after the current step. Resume puts a cancelled or failed job back in the queue and it continues from its checkpoint; a job running when taskq stops is queued again on the next start. The CLI and the MCP server only queue jobs (`taskq api wiki_import source=...`); the running taskq picks them up on its next poll.

Export writes every page as `wiki/<slug>.md` with its slug, title, revision and author in front matter, plus `manifest.json` with the link graph, into a zip deflated at level 9 (`src/util/zip.ts`), under `shared/exports/`. Import reads a zip, a folder (symlinks, hidden folders, `.git` and `node_modules` skipped; at most 5,000 files of 5 MB) or one file. A taskq export (recognised by its `manifest.json` with `format: taskq-wiki`) restores its pages under their own slugs; front matter in any other archive is just text. Other files are digested (`src/wiki/digest.ts`) so bots can use them, not stored as an archive: one page per document under `import/<name>/`, titled by its first heading and starting with the file it came from; a markdown or HTML document longer than 12,000 characters is split into a page per `## ` section (`<slug>--s<n>`) linked from the document's page, and any text without `##` headings, or a long intro, is cut into parts (`<slug>--p<n>`) so nothing is dropped; the `--` in derived slugs never occurs in a file's slug, and `index` is kept for the import's index page; relative links between imported documents become `[[slug]]` links, so wiki search expands along them; HTML is reduced to text; code and data files are wrapped in a fenced block; binary files and unknown formats are skipped and listed. The last step writes `import/<name>/index`, linking every imported page. The checkpoint is the index of the next file and the pages written, and a page whose text is already the same is not written again, so a resumed import adds no revisions.

### OpenAI providers, Kiro and the runtimes taskq drives as processes

A bot's `sdk` is `claude`, `openai` or `kiro`. Its `provider` is how it signs in: `api`, `chatgpt` or `bedrock` for OpenAI (null is `api`), `api`, `subscription` or `bedrock` for Claude (null follows the Connections choice; `configForBot` in `src/agents/claude/auth.ts` sets the child environment per bot), none for Kiro. The hub picks the backend by `sdk`; the OpenAI backend picks by `provider`.

| Runtime | How a turn runs | Session | Tools | Boundary |
|---|---|---|---|---|
| Claude (`claude`) | Claude Agent SDK `query()` in-process | `resume` | in-process MCP `team`, built-ins, plugins | permission mode, sandbox, `botGate` hook |
| OpenAI `api` | Agents SDK, Responses API, `OPENAI_API_KEY` | `previousResponseId` | team tools and file/shell tools as SDK tools | tools chosen by permission mode, `botGate` |
| OpenAI `bedrock` | Agents SDK, Chat Completions at `bedrock-runtime.<region>.amazonaws.com/openai/v1`, `AWS_BEARER_TOKEN_BEDROCK` | taskq keeps `result.history` in `.openai-history.json` in the bot's folder (200 items) | same as `api` | same as `api` |
| OpenAI `chatgpt` | `codex exec --experimental-json` of the user's Codex CLI signed in with ChatGPT (`src/agents/openai/codex.ts`) | Codex thread id, `resume <id>` | Codex's own, plus `taskq mcp --bot <name>` and picked MCP servers via `mcp_servers.*` | Codex sandbox (`read-only`, `workspace-write` with the shared folder and worktrees, `danger-full-access`), `approval_policy=never` |
| Kiro (`kiro`) | `kiro-cli chat --v3 --no-interactive --output-format stream-json --agent taskq-<bot>` in the bot's folder (`src/agents/kiro/team.ts`) | `--resume-id` when the output names the session, else `--resume` (Kiro keys sessions by folder) | Kiro's own by the agent file's `tools`, plus `@taskq` (`taskq mcp --bot`), MCP servers and `skill://` resources | `--trust-tools` by permission mode, `--trust-all-tools` for bypass, `--sandbox` when the bot's sandbox is on |

`taskq mcp --bot <name>` serves one bot's team tools over stdio with the same checks as in-process tools; the backend passes the turn id as `TASKQ_TURN_ID` in that server's environment (Codex `mcp_servers.taskq.env`, the Kiro agent file), so writes count for the turn and a failed turn that already wrote is not retried. The Kiro prompt goes in on stdin. Bedrock and Kiro sessions get an id per session (`local:<bot>:<ms>`, `kiro:<ms>` when Kiro names none). Changing a bot's `sdk` or `provider` clears its session, context and session cost, since no runtime resumes another's session. A failed login turns off only that bot (alert `auth_required`) for OpenAI and Kiro; a Claude login failure pauses the team, since Claude bots share it. The Codex and Kiro backends spawn the CLI themselves with an injectable spawner, so tests run without either installed. Kiro signs in with the user's IAM Identity Center session: Settings saves the start URL and region (`meta.kiro_*`) and runs the device-flow login, showing the verification URL and code; `kiro-cli whoami` reports the state. taskq stores no ChatGPT, SSO or Bedrock token.

### Bots on their own: ask first, goals, second checks

Bots finish reversible work alone and stop where the user has to decide or act (`src/db/bot-requests.ts`, `src/db/goals.ts`, `src/team/tools-autonomy.ts`, migration 010).

- Ask first: `botGate` checks a call against the bot's `ask_first` rules (Bash patterns, or `tool:<name pattern>` for MCP tools) and, unless the bot runs in bypassPermissions, the built-in list of irreversible commands (`DEFAULT_ASK_FIRST`: push, publish, release, `terraform apply`/`destroy`, `kubectl apply`/`delete`, helm, `docker push`, `aws … delete-`/`terminate-`, each also with options between the tool and the subcommand, as in `git -C repo push`). Like blocked commands it is a text match that prevents accidents, not a boundary. A call over 4,000 characters is refused outright, since the user must read all of what they approve; Must check shows the whole call. A match is denied with a request id: `bot_approvals` gets a pending row (one per bot and call) and Must check an `approval_required` alert with `ref: bot-approval:<id>`. Approve once or Deny answers it; the bot gets a message, and an approved call passes the gate exactly once (`used`). Acknowledging the alert without deciding leaves the request pending, and the next identical call raises the alert again. Deleting a bot denies its unused approvals. The hub hands each turn an `ApprovalBroker` over the database. Codex and Kiro run their own tools outside this gate.
- Charter: `charter_owns`, `charter_good`, `charter_never` go into the standing orders as "Your charter".
- Goals: `POST /goals` stores the objective and done-when and messages taskq, whose orders say to split it into owned tasks and to `close_goal` with evidence.
- Weekly review (`src/team/review.ts`): per bot turns, success rate and tasks done or failed; prune candidates (idle or always-failing bots other than taskq); and up to five random recent bot results to check by hand.
- Save as workflow (`src/team/workflow-from-task.ts`): a done task becomes a two-step draft (do, check) from its intent, cautions, the last done run's summary, and the Bash commands and edited files of that run's `tool_call` events.

### Connections

A Kiro turn that fails is read from kiro-cli's own words (`failure` in `src/agents/kiro/team.ts`), from the exit message and from error records in the stream alike. In this order: a spent usage limit and a malformed request are `rejected` (set aside, not retried); words that only mean a lost login (not logged in, expired or invalid token) are `auth_failed`; words that can mean a lost login or something else (`AccessDenied`, `Unauthorized`, `invalid token`, 401, 403, `dispatch failure`) are `auth_failed` only when `kiro-cli whoami` exits non-zero saying "Not logged in"; everything else is retried. An OpenAI on Bedrock turn is `auth_failed` when its AWS profile gives no credentials, at the start of the turn or after a 401 or 403 once the kept token is dropped; with credentials that still work those stay a plain retry.

`src/team/connections.ts` answers two questions the UI shows: how each bot reaches its model, and why a bot is not answering. A bot's connection follows from its settings (`connectionOf`): a Claude bot uses `claude:<api|subscription|bedrock>` (its own `provider`, or the method chosen on the Connections page when it has none, starting from taskq.config.json's `provider`), an OpenAI bot uses `openai:<provider>`, Kiro bots share `kiro`. Each connection is checked the way its turn would fail first: Claude runs the same preflight as task runs (`aws sts get-caller-identity --profile <inferenceProfile>` for bedrock, the saved key or `ANTHROPIC_API_KEY` for api_key), OpenAI API key looks for the key saved in Settings (`TASKQ_HOME/data/openai-api-key`, mode 0600) or `OPENAI_API_KEY`, Bedrock signs a token from its AWS profile (or looks for `AWS_BEARER_TOKEN_BEDROCK` without one), the ChatGPT plan runs `codex login status` (a "not logged in" answer passes when Codex's `config.toml` names a `model_provider` other than `openai`, such as `amazon-bedrock`), Kiro runs `kiro-cli whoami`. Checks are cached for a minute (`?refresh=1` reruns them). How Claude and OpenAI-on-Bedrock sign in is set on the same page (`src/team/connection-settings.ts`): Claude's `provider`, `awsRegion` and `inferenceProfile`, and `bots.bedrockProfile`/`bots.bedrockRegion`. Saved values live in `meta` and override taskq.config.json: every process applies them at start (CLI and MCP included, and a partial change keeps the other saved fields), the server's hub again on each tick so a change from another process arrives within `pollSec`, and a save from the UI at once. When a profile gives no credentials, the message is a fixed sentence chosen by the profile's kind (SSO: `aws sso login`), never the SDK's text, which can hold a `credential_process` command line. With `bots.bedrockProfile` set, an OpenAI Bedrock bot gets a short-term bearer token from that profile's credentials (`@aws/bedrock-token-generator` with `fromIni`, so an SSO profile uses the `aws sso login` session; cached 10 minutes) instead of `AWS_BEARER_TOKEN_BEDROCK`, and the Bedrock check tries the same. `GET /aws/profiles` lists `~/.aws` profiles by name, kind and region, never keys. Each connection also carries the bots on it and its newest finished turn (from `team_turns.sdk`/`provider`). For one bot, `blocker` is the likeliest reason it is not answering: bots paused, the bot turned off; then two hints the hub does not gate on, a failing connection check and a last turn that ended `failed` (the hub retries after `bots.retryAfterSec`). A bot with an open turn is working and has no blocker; cancelled and interrupted turns do not count. The Codex check shows a fixed sentence, not the CLI's output. Checking the Kiro status or starting a Kiro sign-in drops the cached Kiro check.

### Usage and context

A resumed conversation is sent, or billed, again with every turn. When the context a turn ended with (`team_agents.context_tokens`) passes `SESSION_MAX_TOKENS` (100,000, fixed in `src/team/hub.ts`), or 80% of the model's window, `handOver` in `src/team/hub.ts` posts one message from `queue` asking the bot for a handover note and stores `<message id>:<session id>` in `meta` (`team_handover:<bot>`). The turn that reads that message is the session's last: it handles its other messages as usual, and when it ends `done` the session is reset (`resetAgentSession`) and the note the bot saved with `write_handover` (`team_handover_note:<bot>`) is posted as the first message of the new session. A bot that saved no note starts empty with its memory and the wiki. The first turn of a session is never asked, because its size is the session's floor (system prompt, tools, memory) and a new session would start as large. Before every turn `dropStaleHandover` withdraws a request that no longer waits in the inbox (its turn was cancelled, or it was set aside) or that was made in another session (a user reset, an SDK or provider change), together with any saved note. A Codex bot is left out: Codex reports no context size, so taskq passes the limit as `model_auto_compact_token_limit` and Codex compacts its own thread. Kiro reports a percentage, so the threshold there is 80%.

Every turn records `sdk`, `provider`, `model`, input/output/cache tokens and Kiro `credits` on `team_turns` (`src/db/usage.ts`), from what the backend reports: Claude sums each result's `usage`; OpenAI Agents SDK reads `runContext.usage`; Codex reads `turn.completed`; Kiro reads whatever token and credit fields its records carry. Cost stays as before (Claude from the SDK, OpenAI API and Bedrock estimated from `bots.openaiInputPerMTok`/`openaiOutputPerMTok`, ChatGPT plan 0, Kiro 0 with credits). `GET /usage` sums them per SDK and per bot session for the Settings page. Each turn also sets the bot's `context_tokens` (the last model call's input, with cache) and `context_window` (Claude's `modelUsage[model].contextWindow`, a known table for OpenAI models; Kiro reports a percentage, stored as window 100). Codex's `turn.completed` sums every call of the turn, so a Codex bot has no context figure. The turn's `sdk` and `provider` are written when the turn starts. The UI draws the context as a ring.

### Plugins for each SDK

The Plugins menu has Claude, OpenAI and Kiro tabs over one registry, and every bot of a type uses all of it. Skills are shared: a Claude bot loads its skill copy as a local plugin; an OpenAI bot gets a `read_skill` tool listing its skills by name and description, which returns the SKILL.md text and the files next to it. Plugins (`.claude-plugin/plugin.json`) are Claude Code's format and load only in Claude bots. MCP servers (`bot_mcp_servers`) go to every bot: a Claude session gets each as a stdio entry in `mcpServers` next to the `team` server, an OpenAI turn starts each with `MCPServerStdio` in the bot's working directory and closes it after the turn. An MCP server runs as the user outside the bot gate, as a plugin's server does, so registering one is trusting it.

### Task worktrees

A code task whose `repo` is a git repository gets its own worktree when it is created (`createFromInput` with `config`), unless the input says `worktree: false`: `git worktree add -b taskq/<task> TASKQ_HOME/worktrees/<repo>-<task> <HEAD>`. `data.repo` then points at the worktree, `data.source_repo` keeps the user's repository, `data.worktree` holds path, branch, base commit and base branch, and `base_commit` is the base. The worker, the gate and the security review read `repo` and so work in the worktree without changes; the user's checkout is never written. A research or ops task and a plain folder get no worktree. Bots get `TASKQ_HOME/worktrees` as an additional directory (and in a sandbox, a writable one), and `start_task` tells them the worktree path and branch. The task detail shows the workspace with its changed files and diffs, the pull request or compare link and an Open in VS Code link (`vscode://file/<path>`). A picked subfolder of a repository (a package of a monorepo) stays the working folder: `repo` is the same subfolder inside the worktree. Trust (`trustedRepos`) is judged by `source_repo`. Changed files are read with `git diff -z` so non-ASCII names and renames keep their real paths. Removing a worktree keeps its branch with its commits; a worktree with uncommitted edits or new files is removed only with `{ "discard": true }` after the user confirms, since those would be lost. The task keeps pointing at the removed folder, so a later run fails rather than writing into the user's checkout. A sandboxed bot cannot commit in a worktree (the repository's `.git` is outside its writable folders), so it is told to leave changes uncommitted.

### CLI and MCP

`src/ops/operations.ts` names every API route as an operation. `taskq api <operation> key=value...` and the MCP server's `taskq_<operation>` tools call the route in their own process (`ops/local-api.ts`) against the same database, with the same validation as the UI. `taskq workflows` is a readable front for the workflow operations. What needs the running taskq reaches it through the database: a bot cancel leaves a marker (`meta.bot_cancel:<name>`) that the hub reads on its next tick, as a task cancel does. `test/ops-coverage.test.ts` fails when a route has no operation; the UI's live event stream is the one exception.

### Working, cancelling, attachments

- A bot is working while its turn row is open. `GET /bots` gives `working_since` and `running_tasks`; the sidebar turns a ring around the avatar and counts seconds, and the conversation shows a working bar with Stop.
- Stop, Esc in the input, or the menu's Cancel call `POST /bots/:name/cancel`. The hub aborts the turn; `endTurn` records `cancelled`, the turn's messages count as handled (not retried), and a task the bot had running becomes `cancelled` (a task status, retryable like `failed`).
- Attachments are uploaded with `POST /files` into `shared/attachments/`, or are any existing shared file the user picked with `@`, and are named in the message (`team_messages.attachments`) or the task (`data.attachments`). A bot's prompt and a task's prompt list their absolute paths. Task runs may read the shared folder for every type and never write it; bots read and write it (`additionalDirectories`).
- Search: `team_messages_fts` (trigram, kept by triggers) answers `GET /bots/search`. The wiki has its own index (below).

### Settings that persist

Everything the user changes in the app is in the SQLite file under `TASKQ_HOME`: bots and their settings and memory (`team_agents`), the skill and plugin registry, appearance (`ui_font_family`, `ui_font_size`, `ui_language` with `ko` as the default, `ui_theme`), `queue_autorun` and desktop notifications. A restart or a new release binary opens the same file, so nothing is lost; concurrency and model turns per turn come only from `taskq.config.json`. `test/bots-extras.test.ts` checks this with a second connection to the file.

### Queue and run button

The runner claims only ready tasks with no owner (`nextEligible`), and only while `queue_autorun` (Settings, on by default) is on. A bot's task waits for that bot. The run button (`POST /api/tasks/:id/run`) still runs any task once through the runner, whoever owns it; the run has no `bot`, and its result is posted to the owner. Stale recovery skips tasks claimed by a bot.

### Ownership

`create_task` records a task and gives it an owner (the caller by default; another owner is told). It checks the repo (in `trustedRepos` or under `bots.readRoots`, by real path), the count of agent-owned tasks in ready, running, needs_approval or needs_auth against `bots.maxOpenTasks` (draft and review wait for the user and do not count), and duplicates: every task in draft, ready, running, needs_approval or needs_auth whose intent has character-trigram Jaccard similarity of 0.5 or more is named with its owner, and the call is refused unless the caller lists it in `not_duplicate_of`. The check is advisory: rewording can slip past it and similar wording for different work can trip it (examples in `tools-tasks.ts`). Ownership is what keeps two bots off one task: only the owner can start it. Bot priority is capped at 0. A task with an ops type, `access_skill` or `target_profile` is always a draft, and a bot cannot start such a draft; the user promotes it.

`assign_task` moves a task to another bot. The current owner may do it; the orchestrator and bots with the planner role may do it for any unfinished task, the user's included. The update compares the old owner, so two concurrent moves cannot both win. The new and old owners get a message; when the old owner was the user, the user gets an alert. `tasks.owner_since` records when the current owner took the task. The user sets the owner from the task detail dialog, `POST /api/bots/tasks/:id/owner` or `taskq bots assign`.

### Discussions

`start_discussion` opens a thread with 2 to 4 participants and 1 to 3 rounds; at most 3 threads are open at once. Only the participant whose turn it is (`participants[posts % count]`) can `discuss`; each post is delivered to the next speaker, whose prompt carries the thread so far in a `<discussion>` block. A speaker whose turn ends without posting passes. After the last post the thread is `concluding` and the moderator is asked to `conclude_discussion`, which closes it and can write the conclusion to a wiki page. Participants are told not to create tasks inside a discussion. Only a turn that ended normally counts as a pass; a failed turn keeps the floor. A moderator who ends the turn that asked it to conclude without concluding, or who is disabled, gets the thread closed without a conclusion and the user gets an alert; the user can also close a thread (`POST /api/bots/threads/:id/close`, `taskq bots close`).

### Search

`hybridSearch` splits the query into terms of two or more characters. Terms of three or more go to the trigram FTS index, which matches any substring, so a Korean stem finds a word with a particle; shorter terms use `LIKE`. A two-letter Latin term ("pr") scores only as a whole word. Each candidate is scored in JavaScript: 3 per term in the title or slug, 1 + log2(count) per term in the body, times (0.5 + share of terms matched). The five best hits are expanded one hop along `wiki_links` in both directions at 0.4 of the parent's score and marked `via`. Agents are told to read `TASKQ_HOME/wiki/graphify-out/GRAPH_REPORT.md` when it exists.

### Guards and failures

| Guard | Effect |
|---|---|
| Retry | A failed turn with no effect returns its messages; after `maxAttempts` they are set aside with an alert. A turn the provider refused (`rejected`: HTTP 4xx other than 403, 408 and 429 on the OpenAI Agents SDK path) is set aside at once and costs 0. A turn that failed after an effect (message, task, wiki write) is not retried, because a retry would repeat it; its messages are set aside with an alert. The same holds for a turn open at a crash. A failed turn costs 60 s before the agent's next turn |
| Tamper | A call that reaches taskq's data directory or config ends the turn and pauses the bots with a `security_finding` alert, whatever the bot's settings |
| Login | A failed Claude login pauses the bots; a failed OpenAI or Kiro login turns that bot off. Rerunning the checks in Settings > Connections undoes both when the check passes |

Every pause raises one alert and only the user resumes. Pausing the bots stops bot turns. A task a bot started stays running until the bot finishes it or taskq restarts. A message to oneself needs `deliver_at` at least 10 minutes ahead, and a `deliver_at` in the past is refused, so an agent cannot wake itself in a loop. Resuming restarts the loop windows from that moment. A resumed session that no longer exists is dropped and the next turn starts a new one; a reset made while a turn runs is not overwritten when it ends.

`bots.personaSkill`, when set, is named in the prompts. The orchestrator is told to read it before deciding something on the user's behalf, and the reviewers before reviewing, and both are told not to copy its text anywhere. Its judgement is never an approval.

## Worker

The rest of this section describes the `claude` backend.

One `query()` call per task. Common options: `strictMcpConfig: true` with `mcpServers: {}` (no MCP server loads), `maxTurns`, `maxBudgetUsd`, `resume`, `outputFormat` with the result JSON schema, `PreToolUse` and `PostToolUse` hooks that emit `tool_call` and `tool_result`, and `sandbox` with `failIfUnavailable: true`, `allowUnsandboxedCommands: false` and `filesystem.denyRead` for the data directory and the credential directories (`~/.ssh`, `~/.gnupg`, `~/.netrc`, `~/.kube`, `~/.docker`, `~/.config/gh`). `~/.aws` stays readable because aws commands need its config.

| Type | cwd | permissionMode | Tools | Notes |
|---|---|---|---|---|
| research | `outputs/` | `auto` | default | writes only under `outputs/`; reads anywhere except sensitive paths |
| code | `data.repo` | `auto` | default | reads and writes only inside the repo and `outputs/`; `base_commit` recorded before the run |
| security_review | `outputs/`, repo as additional directory | `dontAsk` | `Read`, `Grep`, `Glob`, `Write`, `Bash(git -C * diff *)`, `log`, `show` | reads inside the repo and `outputs/`; `git -C <repo>` read commands only |
| ops_read | `outputs/` | `dontAsk` | `Read`, `Grep`, `Glob`, `Skill`, `Bash(aws *)` | reads only inside `outputs/`; Bash only read-only aws |
| ops_change | `outputs/` | `default` + `canUseTool` | `Read`, `Grep`, `Glob`, `Skill`; no bare `Bash` | reads inside `outputs/` and read-only aws pass; every other call asks |

When `autoMode` is `false` in the config, research and code use `acceptEdits` with an explicit allow list instead of `auto`.

`settingSources` is `['user']` for every type. A code task adds `'project'` only when its repo is listed in `trustedRepos`, because a repository's own settings can define hooks that run commands.

Gating lives in the `PreToolUse` hook (`src/worker/gate.ts`), not in allow rules: user allow rules and skill `allowed-tools` are evaluated before `canUseTool`, and a hook deny holds in every mode. `decide(type, tool, input, ctx)` is the single policy table, and `allowedTools` only spares the prompt for calls the gate allows. Before the per-type rules, the gate denies:

- a call with `dangerouslyDisableSandbox: true`, and every `mcp__*` tool;
- a write or edit inside the task's access skill folder, for every type. Reads inside that folder are allowed (see Access skills);
- a read, write or Glob/Grep pattern (a pattern counts when it has a slash or `~`) that resolves under the data directory or a sensitive location. Paths resolve through symlinks on the deepest existing ancestor, so a link in `outputs/` that points at `~/.ssh` is judged at its target. Sensitive locations are `~/.aws`, `~/.ssh`, `~/.gnupg`, `~/.netrc`, `~/.kube`, `~/.docker`, `~/.config/gh`, `~/.claude` (except that `~/.claude/skills` is readable), any `.env` or `.env.*` segment, and files named `credentials`, `id_rsa`, `id_ed25519`, `taskq.config.json`, or ending in `.pem` or `.key`.

Some of those denials also stop the run (`tamperOf` in `gate.ts`): a call with `dangerouslyDisableSandbox: true`, any path under the data directory, a file named `taskq.config.json` (a Glob or Grep pattern counts when it could match either), and a write under `~/.claude`. These reach taskq itself rather than the task's work, so the hook writes a `tamper_blocked` event, aborts the session, and the worker returns `failed` with `tampered: true`. The task waits as `failed` with a critical `security_finding` until a person reads the run and retries it. Every other denial only refuses that call and the session continues.

The `PreToolUse` hook is fail-closed. If the policy check throws, the call is denied and an `error` event with `source: gate` is written. Without this the SDK would fall back to the permission mode, which allows edits in `acceptEdits` and `auto`.

Then each type decides:

- research: reads allowed; Write and Edit only under `outputs/`; Bash, WebFetch and WebSearch allowed; Monitor, NotebookEdit and unknown tools denied. Bash has no text check here, so the sandbox and auto mode are the control.
- code: Read, Grep, Glob, Write, Edit and NotebookEdit only inside the repo or `outputs/`; Bash allowed; WebFetch, WebSearch, Monitor and unknown tools denied.
- ops_read: Read, Grep and Glob only inside `outputs/`; Skill allowed; Bash only when `isReadOnlyAws` passes; the rest denied.
- ops_change: the same reads and read-only aws pass; the rest asks.
- security_review: Read, Grep and Glob inside the repo or `outputs/`; Write only under `outputs/`; Bash only one `git -C <repo> diff|log|show` command with no output, external diff, textconv, no-index or `-O` flag (diff and show also need `--no-ext-diff` and `--no-textconv`); the rest denied.

For ops_read and ops_change, a Bash command the gate allows gets an explicit `allow`, so a pipeline such as `aws ... | jq .` is not asked again. Every other allow returns `{}`.

The aws check in `aws-guard.ts` is an allow-list over the Bash text: no shell expansion, redirection or globbing outside quotes, and every segment is a read-only aws call or a text filter. Filters take a fixed number of operands and read no named file. Each filter's options come from the table in `filter-args.ts`; an option outside the table, a value that contains `/` or starts with `~`, or an operand past the limit is denied. An option is denied by any unambiguous prefix of `--endpoint-url`, `--ca-bundle`, `--debug`, `--cli-input-*`, `--with-decryption`, `--no-verify-ssl` or `--cli-binary-format`. Verbs that write an output file are denied, and so is a bare positional after the verb, except `s3 ls s3://...`. When the task names a target profile, every aws segment must pass exactly that `--profile`.

A failed Bash call whose first segment is aws and whose output shows an expired login stops the run with `needs_auth` and target scope. Output from a call that succeeded never stops it.

The user prompt names the access skill and its folder when the task has one. The system prompt appendix states the credential rule: `AWS_PROFILE` in the process belongs to inference only; every target-account command passes `--profile <target_profile>`; when the target login has expired, stop and return `needs_auth` instead of trying to log in.

## Access skills

An access skill is a Claude Code skill folder on this machine that signs in to the account a task works on. taskq stores its path and never its content. A task names one with `access_skill`.

- Registration (`src/skills/inspect.ts`) takes an absolute path. It resolves the realpath, requires a directory with a regular `SKILL.md` (lstat, so a symlink is refused) of at most 200 kB, and refuses a folder inside the data directory or `outputs/`. The name is the `name:` frontmatter field, else the directory basename, lowercased, and must match `^[a-z0-9][a-z0-9-]{0,63}$`. The description is `description:`, collapsed to one line and cut to 200 characters. Frontmatter is read by a line-based reader (`frontmatter.ts`) that takes only top-level `key: value` lines between the first two `---` lines; there is no YAML dependency.
- The API and the CLI (`taskq skills`) call the same functions in `src/skills/registry.ts`.
- Discovery (`src/skills/discover.ts`) checks every candidate with the same function, so a symlinked folder is judged where it really points. Entries that fail are skipped.
- The run resolves the name to its stored path in `executeRun` and passes it to the worker as `access_skill_path`. The prompt names the folder. The gate (`src/worker/gate.ts`) allows Read, Grep and Glob inside that folder for every type and denies Write and Edit there. A symlink that leads out of the folder is not inside it and falls to the type's own rules.
- The runtime config is read-only in the UI and API. Changes to `taskq.config.json` take effect after a restart. The desktop notification preference is stored in SQLite and takes effect immediately. Both critical alerts and handoffs keep their recorded history when desktop notifications are disabled.

## Providers

`provider` in the config selects how the `claude` backend authenticates to the model. taskq never stores a key or token; it only shapes the child environment.

The child environment is built from an allow-list: `PATH`, `HOME`, user and shell, locale (`LANG`, `LC_*`), `TMPDIR`, `TERM`, `TZ`, proxy and CA variables (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `AWS_CA_BUNDLE`), the AWS config file paths, `CLAUDE_CONFIG_DIR` and the model name variables. Nothing else of the parent process reaches the session, so an arbitrary variable or an AWS access key in the shell never does.

`caBundle` in the config is for networks where a TLS inspection device re-signs certificates with its own CA. It sets both `AWS_CA_BUNDLE` (the aws CLI) and `NODE_EXTRA_CA_CERTS` (Claude Code) in the child for every provider, and the bedrock preflight runs aws with the same `AWS_CA_BUNDLE`. Without it the shell's values pass through the allow-list. The agent cannot pick its own bundle: `aws-guard.ts` denies `--ca-bundle`.

| provider | Added to the child environment | Preflight |
|---|---|---|
| `bedrock` | `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION`, `AWS_PROFILE=<inferenceProfile>` | `aws sts get-caller-identity --profile <inferenceProfile>` |
| `api_key` | the key saved in Settings > Connections (`data/anthropic-api-key`, mode 0600, never returned by the API), else `ANTHROPIC_API_KEY` from the shell | a key is saved or the variable is set |
| `subscription` | `CLAUDE_CODE_OAUTH_TOKEN` from the shell when set; otherwise the existing Claude Code login | none; an auth error on the first run pauses the queue |

## Masking

`mask.ts` is applied inside the query functions that insert events, run summaries, alerts and proposals, so no caller can skip it. Event payloads are masked leaf by leaf with `maskDeep` and stored as JSON. They are never masked as JSON text. Under a secret-looking key, every string leaf below it is replaced, including the leaves of nested objects and arrays. Each string is scanned up to 20,000 characters; the rest is dropped and the count is shown. The keyword rules are anchored on a word boundary and bound both sides of the key, so a long run of one keyword does not backtrack. The emit path masks first and then clips each string to 500 characters with a `…(+N chars)` suffix. The macOS notification gets the masked message.

Redaction covers AWS key ids, secret keys and session tokens, Anthropic, OpenAI, GitHub, GitLab, npm, Slack, Stripe live keys, Google API keys and `ya29.` OAuth tokens, JWTs, Bearer, Basic and other `Authorization` values, `Cookie` and `Set-Cookie` header values, URL passwords (up to the last `@` before the host), `--password`, `--secret*` and `--token` arguments, `-p` after mysql or psql, values after password, secret, token or api_key keys (a quoted value to its closing quote, an unquoted value to the end of the line, at most 200 characters), JSON values under secret-looking keys, private key blocks including PGP blocks (up to the END line, or the end of the text), sts account ids and plain `Account:` or `account id` numbers (last four digits kept), and the account id inside ARNs.

Prose that names a token or password without a value stays untouched, and so do git commit ids and UUIDs.

The approval input is the one exemption. The exact text is stored in `approvals.input` and nowhere else unmasked, and it is cleared when the request is decided or its run ends. See Approval.

## Critical tests

`npm run test:critical` runs only the tests whose name contains `[critical]`, and pull requests run only these. The full suite (`npm test`) runs everything. Both run test files in parallel (`node --test` uses one process per file, about 30 s on 4 cores against 80 s one file at a time). In CI the type check and the docs and operations coverage run in one job, and the tests in two shard jobs (`--test-shard=1/2`, `2/2`) next to it. Each row below is one invariant and the tests that guard it. The gate rows are cases of the `decide table` and `access skill folder` tables in `test/gate.test.ts`. The aws-guard rows are cases of the `isReadOnlyAws` tables in `test/aws-guard.test.ts`.

| Invariant | Test |
|---|---|
| A change command never runs before approval; the wait is for the user, and a deny stops it | `test/sdk-worker.test.ts` (claude backend): ops_change canUseTool waits for the approval and denies when it resolves false |
| The pending input is byte-identical to what runs, including a private-key marker and more than 500 characters | `test/approval-api.test.ts`: the pending input is the exact text, unmasked |
| A decision names the open request: other ids and a second click are 409 | `test/approval-api.test.ts`: a decision must name the open request |
| A payload with quotes and backslashes is stored as valid JSON and can be approved | `test/approval.test.ts`: a payload with quotes, backslashes and newlines |
| ops_read denies mutating Bash, Write and Edit, MCP, unknown tools and reads of credential paths | `test/gate.test.ts`: decide table rows for ops_read Bash (aws terminate), Write, `mcp__*`, an unknown tool, and `~/.aws/credentials` |
| ops_change returns ask for a non-read tool | `test/gate.test.ts`: decide table row for ops_change Bash (aws stop) |
| dangerouslyDisableSandbox is denied | `test/gate.test.ts`: decide table row for ops_change Bash with `dangerouslyDisableSandbox` |
| A symlink out of an allowed root is denied | `test/gate.test.ts`: decide table row for ops_read Read through `outputs/skills-link` |
| An access-skill folder is read-only | `test/gate.test.ts`: access skill folder row for ops_change Edit of `SKILL.md` |
| aws-guard denies process substitution, command substitution, redirection, an abbreviated `--with-decrypt`, an output-file verb (`s3 cp`), the wrong profile, a filter outside the allow-list, and a secret-returning verb | `test/aws-guard.test.ts`: the eight `[critical]` rows of `isReadOnlyAws denies` and the target-profile block |
| aws-guard allows a describe with `--profile`, `s3 ls`, and a pipe to `jq` | `test/aws-guard.test.ts`: the three `[critical]` rows of `isReadOnlyAws allows` and the target-profile block |
| A foreign Host is 403 | `test/api.test.ts`: a foreign Host is rejected and the local Host is accepted |
| No token, or a wrong token, is 401 | `test/api-auth.test.ts`: every /api request needs the token header |
| A foreign Origin on a write is 403 | `test/api-auth.test.ts`: a write from a foreign Origin is 403 |
| A write that is not application/json is 415 | `test/api-auth.test.ts`: a write must be application/json |
| POST /api/tasks without a status is a draft | `test/api-auth.test.ts`: a task created by POST without a status is a draft |
| An AWS key id and a secret key are redacted | `test/mask.test.ts`: `masks AKIA…` and `masks wJalr…` |
| A URL password and a bearer token are redacted | `test/mask.test.ts`: URL userinfo and Basic and Bearer authorization headers |
| A 20 kB adversarial input is masked within 200 ms | `test/mask.test.ts`: a 20 kB adversarial input is masked within 200 ms |
| Two claimers cannot both claim one task; one wins | `test/runner.test.ts`: a task can be claimed only once |
| A dependent task receives the artifact reference after the prerequisite is marked done | `test/handoff.test.ts` |
| Tasks sharing a lock_key never overlap | `test/runner.test.ts`: tasks sharing a lock_key never overlap |
| A needs_approval task with no heartbeat is not re-run by the tick | `test/recover.test.ts`: a needs_approval task with no heartbeat is not reset to ready |
| A paused queue claims nothing; a running task continues | `test/queue-control.test.ts`: a paused queue claims nothing |
| A cancelled task is not re-run by stale recovery | `test/cancel.test.ts`: a cancelled task is not re-run by stale recovery |
| Proposal apply rejects a path outside memory/ and a dangling symlink | `test/proposal-target.test.ts`: a dangling symlink in memory/, and a path outside both roots |
| A skill proposal never writes SKILL.md | `test/proposal-target.test.ts`: a skill proposal targeting SKILL.md |
| An access-skill registration rejects a relative path and a folder inside the data directory | `test/skills-inspect.test.ts`: a relative path, and a folder inside the data directory or outputs |
| An arbitrary parent variable and AWS_ACCESS_KEY_ID never reach the child, for any provider | `test/worker-auth.test.ts`: nothing outside the allow-list reaches the child |
| `caBundle` reaches the aws CLI and Claude Code for every provider and the bedrock preflight; without it the shell's CA passes through; a relative or missing path is refused | `test/worker-auth.test.ts`: the three caBundle tests; `test/config-time.test.ts`: caBundle must be an absolute path to an existing file |

## API

All routes are under `/api` and return JSON. The server binds `127.0.0.1` only and rejects requests whose `Host` is not `127.0.0.1:<port>` or `localhost:<port>`. A foreign `Origin` on a write is 403.

At each start the process makes a 32-byte random token, keeps it in memory, and prints `http://127.0.0.1:<port>/#token=<token>`. Every `/api` request must send `x-taskq-token: <token>`, compared with `timingSafeEqual`; otherwise it is 401. `GET /api/events/stream` also accepts `?token=` because EventSource cannot set headers. Static UI files need no token. At most 8 event streams are open; the 9th is 429.

Writes (any non-GET under `/api`) must send `Content-Type: application/json`, optionally followed by `; charset=utf-8`. Any other type, or none, is 415.

| Method and path | Purpose |
|---|---|
| `GET /tasks?status=` `POST /tasks` | list with computed `blocked`, create. A POST is a draft unless the body says `"status":"ready"`. `access_skill` must name a registered skill (400 otherwise) |
| `GET /tasks/:id` `PATCH /tasks/:id` | task with runs, deps, alerts and `pending_approval` (`{ request_id, tool, input, bytes, created_at }`, or null); edit data, priority, draft to ready. `access_skill` is checked as on create |
| `POST /tasks/:id/approve` `POST /tasks/:id/deny` | body `{ "request_id": "…" }`. 400 when missing, 409 when it is not the task's open request. Returns the task |
| `GET /approvals` | open requests across tasks: `[{ task_id, task_title, request_id, tool, input, bytes, created_at }]` |
| `GET /handoffs?task_id=` | up to 50 handoff records, pending first, optionally filtered by sender or receiver |
| `POST /handoffs/:id/accept` | accept a current pending handoff and record the timestamp and manual method |
| `POST /tasks/:id/handoff-mode` | set the receiving mode with `{"auto_accept":true}` or `{"auto_accept":false}` |
| `POST /tasks/:id/resume` `POST /tasks/:id/done` | state transitions |
| `POST /tasks/:id/run` | run now, from any status but `running` and `needs_approval`. 409 while the queue is paused or a `blocks` dependency is not done. See "Run now" |
| `GET /runs?from=&to=&type=&lock_key=&outcome=` | runs that overlap the range (started before `to`, not ended before `from`). Each row has `task_title`, `task_type`, `lock_key` and `waits`. Returns `{ runs, truncated }`, newest first, capped at 500 |
| `GET /runs/:id` | run with events, alerts and waits |
| `GET /stats/daily?from=&to=&type=&lock_key=&outcome=` | per day, keyed by start day: runs, done, failed, critical, by type, cost, top 3 summaries. Filters as `/runs` |
| `GET /lock-keys` | distinct non-null lock_keys, sorted |
| `GET /alerts?all=1` `POST /alerts/:id/ack` | unacked first, by severity. Rows carry `task_title` and `ref` (the request id of an approval_required alert) |
| `GET /events?task_id=&run_id=&after=&order=asc\|desc&limit=` | log. `limit` 1 to 500, default 200. `order=desc` returns the newest first |
| `GET /events/stream` | SSE. Starts at the current tail. `Last-Event-ID` or `?after=` resumes. Each event has an `id:` field. Also takes `?token=` |
| `GET /proposals?status=` `POST /proposals/:id/apply` `POST /proposals/:id/reject` | memory and skill proposals |
| `GET /search?q=` | FTS over past runs. Rows carry `task_title` |
| `GET /graph` | nodes with `blocked`, `title`, `last_outcome` (latest run, null while running) and `stale_count`; deps |
| `GET /queue` `POST /queue/pause` `POST /queue/resume` | pause state with `pause_by`. Pause takes `{ "reason" }`, see "Pause, cancel and retry" |
| `POST /tasks/:id/cancel` | cancel a running, needs_approval or needs_auth task. 200 with the task; 409 in other statuses; 404 when unknown |
| `POST /tasks/:id/retry` | retry a failed task. Body `{ "draft": true }` and `{ "resume": true }`, both optional. 200 with the task; 409 in other statuses |
| `GET /settings` | `{ config, home, db_path, access_skills, desktop_notifications, queue_autorun, appearance, font_families, bot_skills, bot_plugins, paths }`. `paths` is `{ home, shared, sessions }`, and `sessions` is `{ claude, codex, kiro }`, each `{ path, exists }`: where that runtime keeps its transcripts. `db_path` is the absolute path of the SQLite file, shown read-only in Settings. `config` is the read-only list of keys in `CONFIG_KEYS` (`src/skills/registry.ts`). Each access skill is `{ name, path, description, ok }`; `ok` is false when `SKILL.md` is gone |
| `POST /settings/desktop-notifications` | persist the desktop notification preference with `{"enabled":true}` or `{"enabled":false}` |
| `POST /files` | upload `{ "name", "data": base64 }` up to 20 MB; saved under `shared/attachments/<day>/<id>-<name>`; returns `{ path }` relative to the shared folder |
| `GET /shared?dir=` `GET /shared/file?path=` | list a folder of the shared folder (up to 500 entries, symlinks left out); download a file. A path outside the shared folder is 400 |
| `POST /shared/preview` | `{ "path" }` for an HTML file of the shared folder returns `{ "url": "/preview/<ticket>/<name>" }`. The ticket lasts 10 minutes and serves that file and the files in its folder, outside `/api` and without the token, with `content-security-policy: sandbox allow-scripts; …; frame-ancestors <taskq>` so the page runs in an opaque origin. 404 for anything else |
| `POST /open-file` | `{ "path", "reveal"? }` opens a file of the shared folder (path relative to it) with its default app on this machine, or with `reveal: true` the folder that holds it. Only document kinds (pdf, office, text, images, html, md and the like) open with an app, and never a file with an exec bit; anything else is 400, because bots write this folder. 404 for anything that is not an existing file inside the shared folder (links out of it included) |
| `POST /open-folder` | `{ "target": "shared" | "home" | "sessions" | "bot" | "task", "runtime"?, "bot"?, "task_id"? }` opens that folder in the desktop file manager and returns its path. `sessions` takes `runtime` claude (default), codex or kiro; `bot` opens where that bot's runtime keeps its conversation (Claude: its project folder, Codex and Kiro: the CLI's store, Bedrock OpenAI: `team/<bot>/`; an API-key OpenAI bot has none and gets 404). Only folders taskq names; 404 when it does not exist yet |
| `GET /plugins/catalog` | the official plugin marketplace (`anthropics/claude-plugins-official`), fetched on demand and cached for an hour, as `{ plugins: [{ name, description, anthropic, source, homepage, install, manifest }], fetched_at }`. `install` is `{ url, path, ref, sha }` (an https git repository, the plugin folder in it, and what the marketplace pins) or null when taskq cannot fetch it. 502 when it cannot be fetched |
| `POST /plugins/install` | `{ "name" }` of a marketplace plugin: git fetches only that commit (`sha`, else `ref`, else the default branch) into `TASKQ_HOME/plugins/<name>`, sparse when the plugin is a folder of a larger repository, writes `.claude-plugin/plugin.json` from the catalog entry when the plugin has none (`strict: false`), and registers it under the marketplace name. Installing again replaces the folder and reloads the bots that use it. 201 with the entry and `replaced`; 409 when a plugin of that name was registered by path; 502 when git fails |
| `POST /settings/queue-autorun` | `{ "enabled": false }` stops the queue from running unowned tasks on its own |
| `GET /update` | `{ current, latest, update_available, can_install, reason?, release_url? }`: the newest non-draft `akbun-taskq-v*` release on GitHub. `can_install` only for the single-file binary on darwin-arm64, the only build the release has |
| `GET /update/progress` | `{ phase, received, total }`: the running install, phase `idle`, `download`, `unpack`, `done` or `failed`; `total` is null when GitHub sends no length. The Install button polls it every 250 ms to fill its bar |
| `POST /update` | downloads that release's `taskq-<os>-<arch>.tar.gz` from github.com, unpacks it and renames it over the running executable; `{ installed, restart: true }`. 409 from a checkout, when up to date, or on a failed download (the binary stays as it was) |
| `POST /settings/appearance` | any of `font_family` (listed in `font_families`), `font_size` (12 to 20), `language` (`ko`, the default, or `en`), `theme` (`system`, `dark`, `light`) |
| `POST /bot-skills` `DELETE /bot-skills/:name` `POST /bot-skills/:name/update` `POST /bot-plugins` `DELETE /bot-plugins/:name` `POST /bot-plugins/:name/update` | register `{ "path": "/abs/dir" }` (201, 400 with the reason, 409 when taken), remove (204), or update a skill or plugin for bots. Update runs `git pull --ff-only` when the folder is a git checkout (else re-reads the description); a plugin installed from the marketplace is installed again at the marketplace's current commit instead (`method: marketplace`). Then it reloads every bot that uses it; returns `{ method, output, reloaded }`. Removing an installed plugin also deletes its folder under `TASKQ_HOME/plugins`; a folder registered by path is never deleted |
| `GET /skills/discover` | `[{ name, path, description, registered }]` found one level deep under `$CLAUDE_CONFIG_DIR/skills` (or `~/.claude/skills`) and `skillsDir`. Capped at 200 |
| `POST /access-skills` | body `{ "path": "/abs/dir" }`. 201 with the stored row; 400 with the reason; 409 when the name or path is already registered |
| `DELETE /access-skills/:name` | 204. 404 when unknown; 409 when a task in draft, ready, running, needs_approval or needs_auth names it (up to 5 ids listed). Never touches the skill's files |
| `GET /bots` `POST /bots` | list `{ enabled, paused, pause_reason, agents, tasks, threads, turns }`; create `{ name, preset?, ...settings }` (201; 409 for a taken name) |
| `GET /bots/:name` `PUT /bots/:name` `DELETE /bots/:name` | one bot with all settings; save settings (rebuilds the skill and plugin copy and posts its reload note; a changed model first posts "Model changed: A → B" from queue; 409 when disabling taskq); delete (409 for taskq; its open tasks become the user's) |
| `GET /bots/search?q=` | every bot conversation: trigram FTS for terms of three characters or more, LIKE for shorter ones, all terms must match, newest first, at most 100 `{ id, sender, recipient, created_at, snippet }` |
| `POST /bots/:name/cancel` | stop the bot's running turn: the turn ends `cancelled`, its messages count as handled, its running task becomes `cancelled`. 409 when it is not working or the bots are not running in this process |
| `GET /bots/:name/memory` `PUT /bots/:name/memory` | the bot's memory text, at most 16,000 characters |
| `POST /bots/:name/reload` `POST /bots/:name/reset` | body `{ "kind": "skill" | "plugin" | "all" }` re-copies and returns what loaded and what is missing; reset starts a new session next turn |
| `GET /bots/:name/catalog` | the models (with their effort levels), permission modes and slash commands for the compose bar. Read from an idle SDK session and cached 10 minutes; `?refresh=1` reads again. `fallback: true` marks the built-in list used when the SDK cannot answer |
| `GET /workflows` `POST /workflows` | list (`?deleted=1` includes deleted) and create. Body `{ name, description, definition: { steps: [{ id, name, kind: do\|check\|handoff\|approval, instructions, needs, to? }] } }`; a loop, an unknown need or a duplicate name is refused |
| `GET /repos` `GET /paths/check` | repositories for the task form (trustedRepos, git repositories under `bots.readRoots` two levels deep, ones recent tasks used); what a path is (`exists`, `git`, `top`, `branch`, `remote`) |
| `POST /bot-mcp-servers` `DELETE /bot-mcp-servers/:name` | register `{ name, command, args, description }` (name `team` is reserved) or remove an MCP server for bots of both SDKs; removing takes it off every bot. `GET /settings` lists them as `bot_mcp_servers` |
| `GET /kiro/status` `POST /kiro/login` | Kiro sign-in: the saved AWS SSO start URL and region, a login in progress (verification URL and code), and `kiro-cli whoami`; login `{ start_url, region }` saves them and runs `kiro-cli login --identity-provider <url> --region <region> --use-device-flow`, answering once the URL and code appear |
| `GET /bot-approvals` `POST /bot-approvals/:id` | open ask-first requests; decide `{ approve }` (409 when no longer pending); the bot is told and an approved call runs once |
| `GET /goals` `POST /goals` | goals newest first; create `{ objective, done_when }` and message taskq |
| `POST /goals/:id/close` | the user closes a goal `{ status: done\|dropped, summary }` (409 when closed) |
| `GET /review` | `?days=7` (1-90): `{ bots, prune, spot_checks }` |
| `POST /tasks/:id/save-workflow` | a done task's workflow draft (409 when not done) |
| `GET /connection-settings` `PUT /connection-settings` | how bots sign in: `{ claude_provider, claude_region, claude_profile, bedrock_profile, bedrock_region, kiro_start_url, kiro_region }` plus `claude_api_key_set`/`openai_api_key_set`; PUT also takes the write-only `claude_api_key` and `openai_api_key` (null removes one), checks (400), saves, applies at once and clears the connection checks |
| `DELETE /connection-settings/:runtime` | Clear on one runtime's section (`claude`, `openai`, `kiro`): its saved sign-in and saved key go, so taskq.config.json and the environment apply again |
| `POST /connections/test` | `{ id }`: reruns one connection's check now, given 5 seconds (no answer is a failure); a pass turns back on what that connection's failed login turned off |
| `GET /aws/profiles` | `[{ name, kind (sso\|role\|keys\|process\|other), region }]` from `AWS_CONFIG_FILE`/`AWS_SHARED_CREDENTIALS_FILE` or `~/.aws` |
| `GET /connections` | `?refresh=1`: `{ team: { enabled, paused, pause_reason }, connections: [{ id (claude\|openai:api\|openai:bedrock\|openai:chatgpt\|kiro), label, detail, status (ok\|error), reason, bots, last, last_ok_at, checked_at }] }` |
| `GET /bots/:name/activity` | `{ pull_requests: [{ url, number, title, state }], background: [{ id, status, task_title }], finished, sub_sessions: [{ agent, started_at }] }`. PRs are the github.com `/pull/N` links in the bot's last 300 messages and its tasks' last 100 run summaries, newest first, at most 20, kept when `gh pr view` says OPEN (cached 60 s) or when gh cannot answer (`unknown`). `background` is the unfinished tasks it owns, `finished` those that ended in the last 24 h, `sub_sessions` the other bots whose open turn took a message from it |
| `GET /bots/:name/browser` `GET /bots/:name/browser/screen` `POST /bots/:name/browser/open` `POST /bots/:name/browser/click` `DELETE /bots/:name/browser/sites/:host` | the bot's browser for the right pane: `{ running, url?, title?, sites }` without starting it (`sites`: where the user allowed it to click and type; DELETE takes one back); a JPEG of the page (404 when not running); open `{ url }` (http or https, starts it); click `{ x, y }` in the page's CSS pixels (1280 wide). 409 with the reason when Chrome is missing or a call fails |
| `GET /bots/:name/steps` | `?since=` (unix seconds), `?limit=` (500, at most 2000): the bot's tool calls, oldest first, `[{ id, turn_id, at, tool, detail }]`. The Claude backend records each call in its PreToolUse hook and the OpenAI backend before each tool runs; `send_message` is left out because the message is already in the conversation, and `detail` is the command, file or pattern, masked and cut at 200 characters. Kiro runs in its own process and records none; an OpenAI bot's registered MCP server tools are called by the SDK runner directly and are not recorded either. The conversation folds calls in a row into one line |
| `GET /bots/:name/turn-errors` | `?limit=` (50, at most 200): the bot's failed turns, newest first, `[{ id, outcome, error, ended_at }]`; the conversation shows them where they happened |
| `GET /bots/:name/connection` | `?refresh=1`: that bot's connection, `team`, `last_turn`, `waiting` (unread messages) and `blocker` (why it would not answer, or null); 404 for an unknown bot |
| `GET /usage` | `?period=today\|7d\|30d\|all`: per SDK and OpenAI provider (`by_sdk`), per bot session (`by_session`: bot, SDK, model, session, turns, input/output/cache tokens, cost, Kiro credits) and one-off task runs (`task_runs`) |
| `POST /bots/wiki/export` `POST /bots/wiki/import` | queue a background job: export every page to `shared/exports/wiki-<time>.zip` (deflate level 9, `wiki/<slug>.md` with front matter plus `manifest.json`); import `{ source, name }` (a zip in the shared folder or an absolute file or folder) as pages under `import/<name>/` |
| `GET /jobs` `GET /jobs/:id` `POST /jobs/:id/cancel` `POST /jobs/:id/resume` | background jobs with `status` (`queued`, `running`, `cancelled`, `done`, `failed`), `done` of `total` steps, `message`, `result` or `error`; cancel stops a running job after its current step and keeps its checkpoint; resume queues a cancelled or failed job to continue from the checkpoint |
| `GET /tasks/:id/workspace` | where the task works: `kind` (`worktree`, `repo`, `folder`, `none`), path, source repository, branch, changed files against the base (`git diff --numstat` plus untracked files), commits ahead, `compare_url` (GitHub compare of the branch against the base branch), `pr_url` (a pull request URL of that repository found in the task's run summaries or bot messages), `vscode_url` |
| `GET /tasks/:id/workspace/diff` `POST /tasks/:id/workspace/remove` | `?file=` one changed file's diff (only files in the changed list); remove the worktree folder (refused while the task runs; the branch stays) |
| `GET /workflows/:id` `PUT /workflows/:id` `DELETE /workflows/:id` | read by id or name, replace, soft delete. Delete answers `{ deleted, told }`: the bots running it get a message; runs keep their copy |
| `POST /workflows/:id/run` | body `{ bot, task_id? }`: starts a run executed by that bot, which gets the steps as a message |
| `GET /workflow-runs` `GET /workflow-runs/:id` | run history (`?workflow=`, `?bot=`, `?task=`) with the bot, status and whether the workflow was deleted; one run with every step's status, output and evidence |
| `POST /workflow-runs/:id/cancel` `POST /workflow-runs/:id/steps/:step/approve` | cancel a running run (the bot is told); the user's answer to an approval step `{ approved, note }` |
| `GET /bots/presets` | role, description and instructions for planner, coder, reviewer, doc-reviewer |
| `GET /bots` fields | Agents carry `busy`, `last_message` and `unread` (messages to the user not yet read) and no `instructions`; `tasks` are unfinished agent-owned tasks with `owner` and `task_title`. Creates the orchestrator when it is missing |
| `POST /bots/tasks/:id/owner` | body `{ "owner": "coder" }` or `{ "owner": null }`. 409 for a done or failed task or an unknown agent |
| `GET /bots/messages?agent=&limit=` `POST /bots/messages` | log, newest first; send `{ "to": "taskq", "body": "…", "attachments": ["attachments/…"] }` as the user (`to` defaults to taskq). `attachments` are up to 20 existing files of the shared folder, relative to it: an upload or a file picked with `@`. 404 for an unknown or disabled bot |
| `POST /bots/messages/read` | mark unread messages to the user as read; body `{ "agent": "coder" }` limits it to one bot |
| `POST /bots/threads/:id/close` | close a discussion without a conclusion. 409 when already closed |
| `POST /bots/pause` `POST /bots/resume` | pause state of the bots, separate from the queue |
| `GET /bots/wiki?q=` `GET /bots/wiki/page?slug=` | list pages, or search them with `hybridSearch` (`{ slug, title, score, snippet, via? }`); read one page |

`type` and `outcome` are checked against the enum lists in `src/api/params.ts` and anything else returns 400. A date (`from`, `to`) must name a real calendar day, so `2026-13-40` is 400. `output_path` must be a relative path inside `outputs/`, and `repo` an absolute path to an existing directory. The CLI `add` applies the same checks. `lock_key` is limited to 100 characters. Every SQL statement binds request values as parameters. `ORDER BY` and `LIMIT` text comes from fixed strings, and `limit` is an integer validated against 1 to 500.

The SSE stream reads the events table by id when an event is written in this process, and otherwise every `pollSec` seconds, so events written by the CLI process reach the browser within a minute.

The database directory `<home>/data` is created with mode 0700, and `taskq.db` with its `-wal` and `-shm` files is kept at 0600. The process also sets its umask to 0077 so files it creates are private.
