# Development

## Run and test

All commands run in `workspace/`. There is no build step; `build` is the type check.

```bash
npm ci
```

```bash
npm run build
```

```bash
npm test
```

Tests use a fake worker and a fake SDK `query`, so they need no credentials and make no model call.

Pull requests run only the tests whose name carries `[critical]`: the invariants whose failure is an incident (approval, gating, API auth, masking, claim, path confinement, child environment). `wiki/architecture.md` lists them. Tag a test that way only when breaking it would be an incident, and keep timing-dependent tests out.

```bash
npm run test:critical
```

## Look at the UI with invented data

`npm run demo` seeds a temporary home through the project's own functions and serves it with a paused queue and no claimable task. It refuses to run when `TASKQ_HOME` is set, so it cannot seed a real home.

```bash
npm run demo
```

## Never start a real session by accident

`taskq run` uses the real Agent SDK worker. Any `ready` task in the home directory starts a model session on this machine, with whatever that task type is allowed to do.

For a server with your own data but no running sessions, use a temporary home whose config cannot authenticate, so preflight fails and the queue stays paused.

```bash
export TASKQ_HOME=$(mktemp -d) TASKQ_NO_NOTIFY=1
```

```bash
echo '{"provider":"api_key","port":4631}' > "$TASKQ_HOME/taskq.config.json"
```

```bash
env -u ANTHROPIC_API_KEY node bin/taskq run
```

Seed runs, events and alerts through the functions in `src/db` and `src/runner`, not with raw SQL, so masking and the approval table behave as in production.

## Where things go

- `TASKQ_HOME` (default: the current directory) holds `taskq.config.json`, `data/`, `outputs/` and `memory/`.
- `data/` is created with mode 0700 and the database with 0600.
- Sessions for research, review and ops tasks run with `outputs/` as their working directory, so the config and the database are not in a writable working directory.

## Build the binary

`node scripts/build-binary.ts` writes `dist/taskq` with bun on PATH. It generates `dist/binary-entry.ts`, which embeds every file under `ui/` and `src/db/schema/` plus the Claude Code binary of the installed SDK, registers them in `src/resources.ts`, and then imports `src/cli/main.ts`. Code that reads a file at run time goes through `resourcePath()`, not `import.meta.url`, or the binary will not find it. The Claude Code binary comes from the platform package npm installed, so build on the target OS. `release-akbun-taskq.yml` builds darwin-arm64 and linux-x64 and releases them as `akbun-taskq-v<version>` from `package.json`; bump the version with any change under `src/`, `ui/` or the package files.

## Adding a schema change

Add `src/db/schema/NNN_name.sql` with the next number. `open.ts` runs files above the stored `user_version` inside `BEGIN IMMEDIATE`. The binary embeds the directory at build time, so nothing else needs registering. The directory is not called `migrations` because the repository's root `.gitignore` ignores that name.

## Changing what a session may do

`src/worker/gate.ts` is the single policy table: task type and tool in, `allow`, `deny` or `ask` out. It runs in a `PreToolUse` hook, which the SDK evaluates before any allow rule. Add a row to `test/gate.test.ts` first. `src/worker/aws-guard.ts` decides whether a shell command is a read-only AWS call; it denies by default, so a new legitimate command needs an explicit entry and a test.

## Caveats

- A real model session, the macOS sandbox and real provider authentication errors have not been exercised by the tests. The README lists what to check by hand.
- The secret-returning AWS verbs in `aws-guard.ts` are a denylist. It has a ceiling; the upgrade is a per-service allow-list.
- Masking is best effort. Do not treat stored events as free of secrets.
