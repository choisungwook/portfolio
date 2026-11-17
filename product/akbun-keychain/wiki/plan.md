# Implementation plan

Eight phases. Each is one pull request, leaves the tests green, and ends with the checks listed under it. Do them in order: each phase uses only what earlier phases built.

Before starting a phase, read [architecture.md](./architecture.md) and the page named in the phase. When the code has to differ from a wiki page, change the page in the same commit and, if the reason will matter later, add a decision under `knowledge/decisions/`.

Tests named `[critical]` guard the security model. Give them that prefix so `node --test --test-name-pattern="\\[critical\\]"` runs them alone.

## Phase 0: scaffold and spikes

Settle the unknowns listed in [development.md](./development.md) before code depends on them.

- Create `workspace/` with `package.json` (version `0.1.0`, `bin`, scripts), `tsconfig.json`, `.gitignore`, `bin/akbun-keychain`, and a `version` command.
- Create `scripts/build-binary.ts` and build a binary locally.
- Spike on Windows, in a throwaway CI job or a real machine: a named pipe server and client through `node:net`, hidden password input, a detached child that survives its parent, an MCP stdio server answering `tools/list`. All inside the compiled binary.

Done when:

- `npm run typecheck` and `npm test` pass with one trivial test.
- The compiled binary prints its version on macOS, Linux and Windows.
- Each spike result is written into the "Verified and not verified" table of development.md.

If named pipes fail under bun: use a TCP listener on 127.0.0.1 with a random port on Windows only. The session token is already required on every request, so the protocol does not change. Record it as a decision.

## Phase 1: core

Page: [vault-format.md](./vault-format.md). Files: `src/core/*`.

- `canonical.ts`, `crypto.ts`, `vault-file.ts`, `lockfile.ts`, `vault.ts`, `audit.ts`, `paths.ts`.
- `vault.ts` exposes: `initVault(password)`, `openVault(password)` returning the data key, and operations that take a data key: `list`, `create`, `update`, `remove`, `rename`, `reveal`, `verify`, `changePassword`.
- No terminal, socket or HTTP code in this phase.

Done when these tests pass:

- `[critical]` a wrong password fails to open and does not write.
- `[critical]` changing `description`, `tags`, `ai_access`, `version` or the entry name in the file makes that entry fail and leaves others readable.
- `[critical]` removing an entry, or replacing one entry with an older copy of itself, fails the MAC.
- `[critical]` lowering `kdf.N` below 2^15 in the file is refused.
- `[critical]` the serialized file contains no plaintext value, checked by searching the file for the test secret in plain, base64 and hex.
- Two processes writing 50 entries each at the same time end with 100 entries.
- A lock file whose pid is not alive is taken over; a live one makes the writer wait, then fail with the lock error.
- A crash between the temp write and the rename leaves the old file valid.
- `changePassword` keeps every entry readable and the old password stops working.
- Files and the directory are created with modes 0600 and 0700 (skipped on Windows).

## Phase 2: CLI with the password

Page: [interfaces.md](./interfaces.md), CLI section. Files: `src/cli/*`.

- `prompt.ts`: hidden input from the terminal, `--password-stdin`.
- Commands that work without an agent: `init`, `status`, `list` (unverified), `set`, `get`, `edit`, `rm`, `passwd`, `verify`, `audit`. In this phase every one of them that touches a value asks for the password.
- Exit codes as specified.

Done when:

- An end-to-end test drives the commands with `--password-stdin` against a temp home and reads back what it set.
- `[critical]` no command accepts a password or a value as an argument; passing one is a usage error.
- `[critical]` the value given to `set` does not appear in `audit.jsonl`.
- Usage errors exit 2, a wrong password exits 4.

## Phase 3: agent and sessions

Pages: [security.md](./security.md), the agent protocol in [interfaces.md](./interfaces.md). Files: `src/agent/*`, `src/core/policy.ts`.

- `unlock`, `lock`, the hidden `agent` role, `agent.json`, idle and absolute timeouts.
- Protocol ops `status`, `list`, `get`, `create`, `verify`, `lock`.
- `policy.ts` is the single place that decides what a session may do. CLI commands now use the session when the rule allows it and ask for the password otherwise.

Done when:

- `[critical]` a request without the token, or with a wrong one, gets `BAD_TOKEN`.
- `[critical]` over the socket, `get` on an `inject` or `deny` key gets `DENIED`, and `create` on an existing name gets `EXISTS`.
- `[critical]` a session-created key is `inject` whatever the request asked for.
- `[critical]` no protocol op changes or deletes an existing entry.
- The agent exits after the idle timeout (test with a short one), removes `agent.json` and the socket.
- A stale `agent.json` with a dead pid is treated as locked.
- A change written by a password-gated CLI command is visible in the agent's next `list`.

## Phase 4: run

Files: `src/agent/run.ts`, `src/agent/mask.ts`, `src/cli/commands/run.ts`.

- The agent spawns the child with the caller's environment plus the secrets, in the caller's working directory, without a shell.
- Masking of plain, base64, hex and URL-encoded forms, correct across chunk boundaries. Values shorter than 8 characters are masked in plain form only, because their encoded forms collide with ordinary text.
- Timeout, and killing the child when the client disconnects.

Done when:

- `[critical]` a child that prints its variable returns `[masked:<name>]`, including when the value is split across two output chunks.
- `[critical]` `run` with a `deny` key gets `DENIED` and starts no process.
- `[critical]` the audit line for `run` holds the program name and variable names, and neither the arguments nor the value.
- The child's exit code is the command's exit code; a failure before spawn exits 125.
- A child still running at the timeout is killed.

## Phase 5: MCP server

Page: MCP tools in [interfaces.md](./interfaces.md). File: `src/mcp/server.ts`.

- Five tools, each a thin call to the agent client. No vault logic here.
- Tool descriptions steer the model to `run_with_secrets`.

Done when:

- A test starts the server over stdio with the SDK client, and calls every tool against a temp vault.
- `[critical]` with no agent running every tool returns `LOCKED` with the unlock instruction and none prompts for a password.
- `[critical]` the tool list contains no tool that overwrites, edits or deletes.
- `run_with_secrets` output over 64 KiB is cut and says so.

## Phase 6: page

Pages: GUI HTTP API in [interfaces.md](./interfaces.md), [features.md](./features.md). Files: `src/gui/server.ts`, `ui/*`, `src/resources.ts`.

- The server, the bootstrap token, the session cookie, the `Host` and `Origin` checks, the idle timeout, the five-failure exit.
- The page with the areas in features.md, each carrying its `data-area`.
- Opening the browser: `open` on macOS, `xdg-open` on Linux, `cmd /c start` on Windows; `--no-open` prints the URL only.

Done when:

- `[critical]` every `/api` route except login returns 401 without the cookie.
- `[critical]` a request with a wrong `Host`, or a write with a wrong `Origin`, is refused.
- `[critical]` the bootstrap token is refused the second time.
- `[critical]` the fifth wrong password ends the server.
- `node .claude/scripts/verify-page.mjs <url>` against `gui --no-open` reports no console error and lists every `data-area` in features.md.
- A browser check creates, reveals, edits and deletes a key, and the audit panel shows the four operations.

## Phase 7: release

Page: release workflow in [development.md](./development.md).

- `.github/workflows/release-akbun-keychain.yml` with verify, build matrix, smoke test, tag and release.
- Register it in `.github/scripts/checks/product-versions.json`.
- `workspace/manual.md`: install, `init`, registering the MCP server, daily use, the limits from security.md.
- Update `README.md` here, the three product indexes' description (drop "design stage"), and `products.json` tags.

Done when:

- The pull request run shows the smoke test passing on all three runners.
- After merge, `gh run list --workflow=release-akbun-keychain.yml` shows the master run succeeded and the release holds three archives.
- A downloaded binary on a machine without Node completes the manual's first-use steps.

## Later, not in these phases

Listed so they are not mistaken for omissions. Each needs its own decision record.

- `run --interactive`: a password-gated run in the caller's terminal, for programs that need one.
- A per-key allowlist of programs that may receive the value.
- A human approval prompt per use for chosen keys.
- Argon2id as the KDF once the checkout runtime has it.
- Rotating the data key, export and import, clipboard copy with auto-clear.
- darwin-x64 and linux-arm64 binaries, and a self-update command.
