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
                            |- alerts/   must-check rules, macOS notification
                            '- db/       node:sqlite, WAL, numbered migrations
CLI (taskq add/list/...) ---- opens the same SQLite file directly
```

## Stack

| Part | Choice | Why |
|---|---|---|
| Runtime | Node 24, TypeScript run by type stripping | No build step. `tsc --noEmit` only checks types |
| Storage | `node:sqlite` (WAL, FTS5) | Built in, no native addon. Atomic claim needs a real transaction |
| HTTP | Hono + `@hono/node-server` | Small router, SSE helper |
| Agent | `@anthropic-ai/claude-agent-sdk` | Sessions, permissions, hooks, sandbox |
| UI | Static ES modules in `ui/`, no framework, no build | Served by the API as files |
| Tests | `node:test` with a fake worker | CI needs no credentials and no model call |

Type stripping rules: import with the `.ts` extension, no `enum`, no parameter properties, no namespaces. `tsconfig.json` sets `erasableSyntaxOnly`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `noEmit`, `strict`.

## Directory layout

```text
workspace/
  package.json  tsconfig.json  taskq.config.example.json  .gitignore
  bin/taskq                 # #!/usr/bin/env node, imports src/cli/main.ts
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
      notify.ts             # macOS notification for critical
    agents/
      types.ts              # AgentBackend: createWorker, preflight, ask
      index.ts              # registry: config.agent -> backend
      claude/               # the Claude Agent SDK backend
        index.ts worker.ts hooks.ts profiles.ts auth.ts ask.ts result.ts
    worker/                 # backend-neutral policy
      aws-guard.ts filter-args.ts result-schema.ts text.ts
    memory/                 # phase 2
      similar.ts retrospect.ts
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

export interface WorkerContext {
  task: Task
  runId: string
  resumeSessionId: string | null
  similar: SimilarTask[]                                          // up to 3, from memory/similar.ts
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

1. Preflight inference auth (see Providers). On failure set the queue pause with `pause_by = preflight` and raise `auth_required`. While the queue is paused, the tick re-runs the preflight once a minute and a passing check lifts only a preflight pause.
2. On start, recover every `running` and `needs_approval` task as stale. On each tick, recover `running` and `needs_approval` tasks whose `heartbeat_at` is older than the TTL. A NULL heartbeat is never recovered by the tick.
3. Pick `ready` tasks by priority whose `blocks` dependencies are all `done`.
4. Claim atomically: `UPDATE tasks SET status='running', claimed_by=?, heartbeat_at=? WHERE id=? AND status='ready'`, plus a `NOT EXISTS` clause that rejects a task whose `lock_key` a `running`, `needs_approval` or `needs_auth` task holds, and a clause that rejects every claim while `meta.queue_paused` is `1`. The lock and pause checks are inside the statement, so two runners cannot both claim tasks that share a lock key, and a pause cannot race a claim. The changed row count decides.
5. Limit concurrency to `maxConcurrent` (default 3).
6. Create the `runs` row, call the worker, update `heartbeat_at` every 30 s, then finish. Before the worker is called, a task with an `access_skill` resolves it to the registered path. A missing registration or a missing `SKILL.md` finishes the run as `failed` with the summary `access skill <name> is missing at <path>`, and no session starts.

### Approval

`requestApproval` inserts an `approvals` row that holds the exact tool input, and writes a `permission_request` event with the masked, clipped copy (`request_id`, `tool`, `input`, `reason`, `bytes`). It then sets the task to `needs_approval` and raises `approval_required` with `ref` set to the request id. The wait loop polls that row's `decision` once a second. A denied or expired request returns false to the worker.

- `decideApproval(db, taskId, requestId, approve)` answers only the task's single open request. Any other `request_id` throws `ApprovalError`, which the API maps to 409. In one transaction it writes the decision, clears `input`, writes the `approved` or `denied` event, and acknowledges the task's open `approval_required` alerts. The API and the CLI both call this function.
- Ending a run (`endRun`) and stale recovery mark the open rows of that run or task as `expired` and clear `input`.
- Requests from one run are serialized: a second `requestApproval` waits until the first is answered. Recovery acknowledges the open `approval_required` alerts. If the process dies while waiting, the task is recovered as stale and the resumed session asks again.
- The `approval_required` message is `Approval needed: <tool>:` followed by the first 120 characters of the masked command. The macOS notification is titled `taskq · <task id>` and ends with `taskq approve <task id>` (`resume` for `auth_required`, `show` for `security_finding`); the command part is cut to fit the 200-character limit.

The exact input is stored unmasked and unclipped, and only while the request is open, because a masked or clipped copy can hide the part that runs. A shell comment such as `aws s3 ls # -----BEGIN PRIVATE KEY-----` makes the masking rule redact the rest of the line, so the masked view reads `aws s3 ls` while `aws iam delete-user` is the command that runs. The decision record in `knowledge/decisions/` has the full reasoning.

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

## Agent backends

`config.agent` picks the backend (default `claude`). `src/agents/index.ts` maps the name to an `AgentBackend`, and `src/cli/run.ts` is the only caller: the runner gets `createWorker(config)` and `preflight(config)`, and the retrospector gets `ask(config, request)`. The runner, API, database and UI never import an SDK.

| Method | Contract |
|---|---|
| `createWorker(config)` | Returns the `Worker` the runner calls once per run. Every tool call goes through `decide` and `tamperOf` in `src/worker/gate.ts`; a call `tamperOf` names aborts the run with `tampered: true`. The final answer follows `RESULT_SCHEMA`. A failed model login returns `needs_auth` with `auth_scope: 'inference'` |
| `preflight(config)` | Checks the model login before claims. A failure pauses the queue |
| `ask(config, { prompt, schema, cwd })` | One short call with no tools that returns JSON matching `schema`, or `undefined` |

Adding a backend: put it under `src/agents/<name>/`, add the name to `AgentName` in `types.ts`, to `BACKENDS` in `index.ts` and to `AGENTS` in `config.ts`. `test/agents.test.ts` checks that every registered backend has the three methods. The policy, the prompt and the result schema in `src/worker/` are shared; what a backend writes itself is the mapping from its SDK's tool-call hook and permission model to `decide`, which is what `claude/hooks.ts` and `claude/profiles.ts` do for Claude.

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
- The config is read-only in the UI and the API. A sandbox or auth setting changed from a web page would be an attack path, so the only write the API accepts is the skill registry. Changes to `taskq.config.json` take effect after a restart.

## Providers

`provider` in the config selects how the `claude` backend authenticates to the model. taskq never stores a key or token; it only shapes the child environment.

The child environment is built from an allow-list: `PATH`, `HOME`, user and shell, locale (`LANG`, `LC_*`), `TMPDIR`, `TERM`, `TZ`, proxy and CA variables (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `AWS_CA_BUNDLE`), the AWS config file paths, `CLAUDE_CONFIG_DIR` and the model name variables. Nothing else of the parent process reaches the session, so an arbitrary variable or an AWS access key in the shell never does.

`caBundle` in the config is for networks where a TLS inspection device re-signs certificates with its own CA. It sets both `AWS_CA_BUNDLE` (the aws CLI) and `NODE_EXTRA_CA_CERTS` (Claude Code) in the child for every provider, and the bedrock preflight runs aws with the same `AWS_CA_BUNDLE`. Without it the shell's values pass through the allow-list. The agent cannot pick its own bundle: `aws-guard.ts` denies `--ca-bundle`.

| provider | Added to the child environment | Preflight |
|---|---|---|
| `bedrock` | `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION`, `AWS_PROFILE=<inferenceProfile>` | `aws sts get-caller-identity --profile <inferenceProfile>` |
| `api_key` | `ANTHROPIC_API_KEY` from the shell | the variable is set |
| `subscription` | `CLAUDE_CODE_OAUTH_TOKEN` from the shell when set; otherwise the existing Claude Code login | none; an auth error on the first run pauses the queue |

## Masking

`mask.ts` is applied inside the query functions that insert events, run summaries, alerts and proposals, so no caller can skip it. Event payloads are masked leaf by leaf with `maskDeep` and stored as JSON. They are never masked as JSON text. Under a secret-looking key, every string leaf below it is replaced, including the leaves of nested objects and arrays. Each string is scanned up to 20,000 characters; the rest is dropped and the count is shown. The keyword rules are anchored on a word boundary and bound both sides of the key, so a long run of one keyword does not backtrack. The emit path masks first and then clips each string to 500 characters with a `…(+N chars)` suffix. The macOS notification gets the masked message.

Redaction covers AWS key ids, secret keys and session tokens, Anthropic, OpenAI, GitHub, GitLab, npm, Slack, Stripe live keys, Google API keys and `ya29.` OAuth tokens, JWTs, Bearer, Basic and other `Authorization` values, `Cookie` and `Set-Cookie` header values, URL passwords (up to the last `@` before the host), `--password`, `--secret*` and `--token` arguments, `-p` after mysql or psql, values after password, secret, token or api_key keys (a quoted value to its closing quote, an unquoted value to the end of the line, at most 200 characters), JSON values under secret-looking keys, private key blocks including PGP blocks (up to the END line, or the end of the text), sts account ids and plain `Account:` or `account id` numbers (last four digits kept), and the account id inside ARNs.

Prose that names a token or password without a value stays untouched, and so do git commit ids and UUIDs.

The approval input is the one exemption. The exact text is stored in `approvals.input` and nowhere else unmasked, and it is cleared when the request is decided or its run ends. See Approval.

## Critical tests

`npm run test:critical` runs only the tests whose name contains `[critical]`, and pull requests run only these. The full suite (`npm test`) runs everything. Each row below is one invariant and the tests that guard it. The gate rows are cases of the `decide table` and `access skill folder` tables in `test/gate.test.ts`. The aws-guard rows are cases of the `isReadOnlyAws` tables in `test/aws-guard.test.ts`.

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
| `POST /tasks/:id/approve` `deny` | body `{ "request_id": "…" }`. 400 when missing, 409 when it is not the task's open request. Returns the task |
| `GET /approvals` | open requests across tasks: `[{ task_id, task_title, request_id, tool, input, bytes, created_at }]` |
| `POST /tasks/:id/resume` `done` | state transitions |
| `GET /runs?from=&to=&type=&lock_key=&outcome=` | runs that overlap the range (started before `to`, not ended before `from`). Each row has `task_title`, `task_type`, `lock_key` and `waits`. Returns `{ runs, truncated }`, newest first, capped at 500 |
| `GET /runs/:id` | run with events, alerts and waits |
| `GET /stats/daily?from=&to=&type=&lock_key=&outcome=` | per day, keyed by start day: runs, done, failed, critical, by type, cost, top 3 summaries. Filters as `/runs` |
| `GET /lock-keys` | distinct non-null lock_keys, sorted |
| `GET /alerts?all=1` `POST /alerts/:id/ack` | unacked first, by severity. Rows carry `task_title` and `ref` (the request id of an approval_required alert) |
| `GET /events?task_id=&run_id=&after=&order=asc\|desc&limit=` | log. `limit` 1 to 500, default 200. `order=desc` returns the newest first |
| `GET /events/stream` | SSE. Starts at the current tail. `Last-Event-ID` or `?after=` resumes. Each event has an `id:` field. Also takes `?token=` |
| `GET /proposals?status=` `POST /proposals/:id/apply` `reject` | memory and skill proposals |
| `GET /search?q=` | FTS over past runs. Rows carry `task_title` |
| `GET /graph` | nodes with `blocked`, `title`, `last_outcome` (latest run, null while running) and `stale_count`; deps |
| `GET /queue` `POST /queue/pause` `POST /queue/resume` | pause state with `pause_by`. Pause takes `{ "reason" }`, see "Pause, cancel and retry" |
| `POST /tasks/:id/cancel` | cancel a running, needs_approval or needs_auth task. 200 with the task; 409 in other statuses; 404 when unknown |
| `POST /tasks/:id/retry` | retry a failed task. Body `{ "draft": true }` and `{ "resume": true }`, both optional. 200 with the task; 409 in other statuses |
| `GET /settings` | `{ config, home, db_path, access_skills }`. `db_path` is the absolute path of the SQLite file, shown read-only in Settings. `config` is the read-only list of keys in `CONFIG_KEYS` (`src/skills/registry.ts`). Each access skill is `{ name, path, description, ok }`; `ok` is false when `SKILL.md` is gone |
| `GET /skills/discover` | `[{ name, path, description, registered }]` found one level deep under `$CLAUDE_CONFIG_DIR/skills` (or `~/.claude/skills`) and `skillsDir`. Capped at 200 |
| `POST /access-skills` | body `{ "path": "/abs/dir" }`. 201 with the stored row; 400 with the reason; 409 when the name or path is already registered |
| `DELETE /access-skills/:name` | 204. 404 when unknown; 409 when a task in draft, ready, running, needs_approval or needs_auth names it (up to 5 ids listed). Never touches the skill's files |

`type` and `outcome` are checked against the enum lists in `src/api/params.ts` and anything else returns 400. A date (`from`, `to`) must name a real calendar day, so `2026-13-40` is 400. `output_path` must be a relative path inside `outputs/`, and `repo` an absolute path to an existing directory. The CLI `add` applies the same checks. `lock_key` is limited to 100 characters. Every SQL statement binds request values as parameters. `ORDER BY` and `LIMIT` text comes from fixed strings, and `limit` is an integer validated against 1 to 500.

The SSE stream polls the events table by id every `pollSec` seconds, so events written by the CLI process reach the browser too.

The database directory `<home>/data` is created with mode 0700, and `taskq.db` with its `-wal` and `-shm` files is kept at 0600. The process also sets its umask to 0077 so files it creates are private.
