# Interfaces

Four surfaces over one core. The access rule in [security.md](./security.md) applies to all of them; this page lists the shape of each.

## CLI

"Session" means the agent is running. "Password" means the command prompts for the root password, or reads it from stdin with `--password-stdin`.

| Command | Needs | What it does |
|---|---|---|
| `init` | new password, typed twice | Creates the home directory and an empty vault |
| `unlock [--ttl <duration>]` | password | Starts the agent |
| `lock` | nothing | Stops the agent |
| `status [--json]` | nothing | Locked or unlocked, expiry, vault path, entry count |
| `list [--tag <t>] [--json]` | nothing | Names, descriptions, tags, access levels, read from the file. Marked unverified while locked, because metadata cannot be authenticated without the key |
| `set <name> [--description <d>] [--tag <t>]... [--ai-access <level>]` | session for a new name, password for an existing one | Value comes from a hidden prompt, or from stdin when stdin is not a terminal |
| `get <name>` | session for `reveal`, password otherwise | Prints the value to stdout |
| `edit <name> [--description] [--tag]... [--ai-access] [--rename <new>]` | password | Changes metadata |
| `rm <name>` | password | Deletes an entry |
| `run --env <VAR>=<name>... [--timeout <duration>] -- <command>...` | session | Runs the command through the agent with the secrets in its environment. Output is masked. Not interactive: the child has no terminal |
| `passwd` | old and new password | Re-wraps the data key and stops the agent |
| `verify` | session or password | Checks every entry and the MAC, lists what fails |
| `audit [--limit <n>] [--json]` | nothing | Prints the audit log, newest last |
| `gui [--port <n>] [--no-open]` | password, entered in the page | Serves the page until logout |
| `mcp` | nothing to start | Runs the MCP server on stdio |
| `version` | nothing | Prints the version from package.json |

`set --ai-access` is honored only with the password; a session-created key is always `inject`.

With `--password-stdin` nothing is prompted and stdin is read in a fixed order, so tests and scripts need no terminal:

| Command | Line 1 | Rest of stdin |
|---|---|---|
| `init` | the new password, with no confirmation line | ignored |
| `unlock`, `get`, `edit`, `rm`, `verify` | the password | ignored |
| `set` | the password | the value, with one trailing newline removed |
| `passwd` | the old password | line 2 is the new password |

Without `--password-stdin`, `set` reads the whole of a non-terminal stdin as the value, and asks for the password on the terminal when the rule requires one.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Unexpected error |
| 2 | Usage error |
| 3 | Locked: no agent running |
| 4 | Denied by the access rule, or wrong password |
| 5 | Integrity failure |
| 6 | Lock file timeout |
| 7 | No such key |
| 8 | A key with that name already exists |
| 124 | `run` killed the child at the timeout |
| 125 | `run` could not start the program |

`run` returns the child's own exit code when the child ran. Codes 3 to 8 keep their meaning for `run` when it fails before starting the child; a child that happens to exit with one of them is indistinguishable, which is accepted.

## Agent protocol

Newline-delimited JSON over the local socket. One request per line, one or more response lines per request, matched by `id`.

A request and its reply:

```json
{"id":"1","token":"<session token>","actor":"mcp","op":"list","params":{}}
{"id":"1","ok":true,"result":{"entries":[{"name":"github/personal-token","ai_access":"inject"}]}}
```

A failure reply:

```json
{"id":"2","ok":false,"error":{"code":"DENIED","message":"github/personal-token is inject: use run"}}
```

| Op | Params | Result |
|---|---|---|
| `status` | none | `{expires_at, idle_expires_at, entries}` |
| `list` | `{tag?}` | `{entries: [metadata]}` |
| `get` | `{name}` | `{value}`, `reveal` keys only |
| `create` | `{name, value, description?, tags?}` | `{name, version}`, new names only |
| `run` | `{command: string[], env: {VAR: name}, base_env, cwd, stdin?, timeout_ms?}` | stream lines `{id, stream: "stdout" or "stderr", data}` then `{id, ok: true, result: {exit_code}}` |
| `verify` | none | `{entries_failed: [name], mac_ok}` |
| `lock` | none | `{}`, then the agent exits |

Error codes and the CLI exit code each maps to. The MCP server returns them as tool errors.

| Error code | Exit code | When |
|---|---|---|
| `LOCKED` | 3 | No agent, or the agent expired |
| `BAD_TOKEN` | 3 | The token does not match. The client treats `agent.json` as stale |
| `DENIED` | 4 | The access rule refuses the operation |
| `NOT_FOUND` | 7 | No such key |
| `EXISTS` | 8 | `create` on an existing name |
| `INVALID` | 2 | A name, tag, value size or parameter breaks the format rules |
| `INTEGRITY` | 5 | An entry or the MAC fails |
| `LOCK_TIMEOUT` | 6 | `vault.lock` was held for 5 seconds |
| `SPAWN_FAILED` | 125 | The program could not be started |
| `TIMEOUT` | 124 | The child was killed at the timeout. The MCP tool returns `exit_code: null` and `timed_out: true` |

For a `deny` key, `list` returns only `name` and `ai_access`; description and tags are left out.

The agent never offers an op that returns an `inject` value. A client that speaks the protocol directly gets no more than the CLI does.

## MCP tools

Stdio server from `@modelcontextprotocol/sdk`. Register it in Claude Code with:

```bash
claude mcp add akbun-keychain -- akbun-keychain mcp
```

| Tool | Input | Output |
|---|---|---|
| `keychain_status` | none | Locked or unlocked, expiry. Answers normally while locked |
| `list_keys` | `{tag?}` | Name, description, tags, `ai_access`, `updated_at`. Only name and `ai_access` for a `deny` key |
| `run_with_secrets` | `{command: string[], env: {VAR: keyName}, cwd?, stdin?, timeout_sec?}` | `{exit_code, timed_out, stdout, stderr}`, masked, each cut at 64 KiB. Default timeout 120 seconds |
| `get_secret` | `{name}` | The value, for `reveal` keys only |
| `create_secret` | `{name, value, description?, tags?}` | Creates a new `inject` key. Fails if the name exists |

Tool descriptions must tell the model to prefer `run_with_secrets` and to call `list_keys` first. When the vault is locked every tool except `keychain_status` returns `LOCKED` with the text "Ask the user to run `akbun-keychain unlock` in a terminal." The server must not try to obtain the password itself.

There is no tool to overwrite, edit or delete. Those need the root password and belong to the CLI and the page.

## GUI HTTP API

`node:http` on 127.0.0.1. Every `/api` route except login needs the session cookie, a `Host` header equal to `127.0.0.1:<port>`, and on non-GET requests an `Origin` equal to `http://127.0.0.1:<port>`. Responses carry `Content-Security-Policy: default-src 'self'` and `Cache-Control: no-store`.

| Method and path | Body | Result |
|---|---|---|
| `POST /api/login` | `{bootstrap, password}` | Sets the cookie. The bootstrap token is consumed by the first successful login and refused afterwards. A wrong password returns 401 `{error: "BAD_PASSWORD", attempts_left}` and leaves the token valid; the fifth ends the server |
| `POST /api/logout` | none | Ends the server process |
| `GET /api/keys` | none | All metadata |
| `POST /api/keys` | `{name, value, description, tags, ai_access}` | Creates |
| `PATCH /api/keys/<name>` | any of `{value, description, tags, ai_access, rename}` | Updates |
| `DELETE /api/keys/<name>` | none | Deletes |
| `POST /api/keys/<name>/reveal` | none | `{value}` |
| `GET /api/audit?limit=<n>` | none | Latest audit lines |
| `GET /api/agent` | none | Agent status |
| `POST /api/agent/unlock` | `{ttl?}` | Starts the agent with the key the server already holds |
| `POST /api/agent/lock` | none | Stops the agent |

`<name>` is URL-encoded because names contain `/`. The page has no build step: [features.md](./features.md) names its areas.
