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

## Add a feature: interface first

Every new feature starts with its interface, and the implementation is written against it.

1. Define the interface in `types.ts` of the feature's directory under `src/`: what callers pass, what they get back, and the contract an implementation must keep, as a comment on the interface.
2. Put the first implementation in its own subdirectory or file, named after what it uses (`claude/`, `sqlite.ts`).
3. Wire the implementation in one place, a registry or `src/cli/run.ts`. The runner, API, CLI and UI import only the interface.
4. Test callers with a fake implementation of the interface, and the real implementation in its own tests.

`src/agents/types.ts` with `src/agents/claude/` is the reference. Helper functions inside one implementation are not features and need no interface of their own.

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

- `TASKQ_HOME` (default: the current directory; `~/.taskq` for the desktop app) holds `taskq.config.json`, `data/`, `outputs/` and `memory/`.
- `data/` is created with mode 0700 and the database with 0600.
- Sessions for research, review and ops tasks run with `outputs/` as their working directory, so the config and the database are not in a writable working directory.

## Build the binary

`node scripts/build-binary.ts` writes `dist/taskq` with bun on PATH. It generates `dist/binary-entry.ts`, which embeds every file under `ui/` and `src/db/schema/` plus the Claude Code binary of the installed SDK, registers them in `src/resources.ts`, and then imports `src/cli/main.ts`. Code that reads a file at run time goes through `resourcePath()`, not `import.meta.url`, or the binary will not find it. The Claude Code binary comes from the platform package npm installed, so build on the target OS. `release-akbun-taskq.yml` builds darwin-arm64 and linux-x64 and releases them as `akbun-taskq-v<version>` from `package.json`; bump the version with any change under `src/`, `ui/` or the package files.

## Build the desktop app

`workspace/desktop/` is a Tauri shell around the executable. Its version is `workspace/package.json`'s. To build it locally, put an executable at `desktop/src-tauri/binaries/taskq-aarch64-apple-darwin` (the real `dist/taskq`, or a script that runs `node scripts/demo.ts` and rewrites its `taskq demo: ` line to `taskq running at `, which opens the demo data without a model call), then run `npm ci` and `npx tauri build --bundles app` in `desktop/`. `npm test` there runs the `taskq-launch` crate's tests; `verify-akbun-taskq.yml` runs the same on pull requests. The release workflow builds the dmg only on the macOS job of a master push, so a pull request does not prove the bundle builds: check the release run after merging. The app has no Tauri updater; taskq's own update replaces the executable inside the bundle ([decision](../knowledge/decisions/2026-11-desktop-app-shell.md)).

## Maintain the changelog

Add a `## <version>` section to [CHANGELOG.md](../CHANGELOG.md) for the version in `workspace/package.json`. Use `### Added`, `### Changed`, `### Fixed` or `### Removed` and describe each feature or behavior in a bullet. Commit the entry with the corresponding code. GitHub Actions uses that section for the release notes.

Codex checks the committed diff before direct `git push` and `gh pr create` shell commands. Review and trust the project hook in `/hooks`. In a linked worktree, Codex reads hook definitions from the main checkout. The taskq PR workflow also checks the entry against the PR's base.

## Adding a schema change

Add `src/db/schema/NNN_name.sql` with the next number. `open.ts` runs files above the stored `user_version` inside `BEGIN IMMEDIATE`. The binary embeds the directory at build time, so nothing else needs registering. The directory is not called `migrations` because the repository's root `.gitignore` ignores that name.

## Changing what a session may do

`src/worker/gate.ts` is the single policy table: task type and tool in, `allow`, `deny` or `ask` out. It runs in a `PreToolUse` hook, which the SDK evaluates before any allow rule. Add a row to `test/gate.test.ts` first. `src/worker/aws-guard.ts` decides whether a shell command is a read-only AWS call; it denies by default, so a new legitimate command needs an explicit entry and a test.

## Caveats

- A real model session, the macOS sandbox and real provider authentication errors have not been exercised by the tests. The README lists what to check by hand.
- The secret-returning AWS verbs in `aws-guard.ts` are a denylist. It has a ceiling; the upgrade is a per-service allow-list.
- Masking is best effort. Do not treat stored events as free of secrets.
