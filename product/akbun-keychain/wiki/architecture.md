# Architecture

## Process roles

One executable, `akbun-keychain`, runs in one of four roles chosen by its first argument.

| Role | Started by | Lifetime | Holds the data key |
|---|---|---|---|
| CLI | the user or an agent's shell | one command | only inside a password-gated command, for that command |
| Agent | `unlock`, as a detached process | until `lock`, 15 minutes idle, or 8 hours | yes, in memory |
| MCP server | the AI client, over stdio (`akbun-keychain mcp`) | the client session | never |
| GUI server | `gui`, in the foreground | until logout, Ctrl+C, or 10 minutes idle | yes, after login |

The four roles as a diagram:

```text
 human terminal            AI client
      |                        |
  CLI (per command)      MCP server (stdio)
      |        \               |
      |         \   local socket + session token
      |          v             v
      |        Agent  (data key in memory)
      |          |  \
      |          |   spawns child with secrets in env, masks its output
      v          v
   core library (crypto, vault file, lock file, audit)
      ^
      |
  GUI server (127.0.0.1, own data key after login) <--- browser page
```

Three processes can hold the data key: a password-gated CLI command, the agent, and the GUI server. All of them go through the same core library, and every write takes the lock file, so they do not need to know about each other. The agent re-reads `vault.json` on each request, so a change made by the GUI or CLI is visible at once.

## Why an agent process

An AI client cannot type the root password, and must not know it. The human types it once in `unlock`; the agent keeps the derived data key so later calls need no password. This is the ssh-agent pattern. See [the decision](../knowledge/decisions/2026-11-agent-holds-data-key.md).

## Key flows

### Unlock

1. `unlock` reads the root password from the terminal without echo.
2. It derives the key-encryption key with scrypt and unwraps the data key. A failed unwrap means a wrong password.
3. It spawns itself detached with the argument `agent` and writes the data key and the timeouts to the child's stdin, then closes it.
4. The agent listens on the local socket, writes `agent.json` (pid, endpoint, session token, expiry) with mode 0600, and prints one ready line. `unlock` exits when it reads that line.

### An agent uses a secret

1. The AI client calls the MCP tool `run_with_secrets` with a command and a map of environment variable to key name.
2. The MCP server forwards it to the agent with the session token from `agent.json`.
3. The agent checks each key's `ai_access`, decrypts the allowed values, and spawns the command itself with those variables added to the environment the caller sent.
4. The agent replaces every occurrence of the values in stdout and stderr with `[masked:<key name>]`, and returns the exit code and the masked output.
5. The agent appends one line to the audit log.

The value goes from the agent to the child's environment and nowhere else. The MCP server and the model never receive it.

### A human edits in the page

1. `gui` starts an HTTP server on 127.0.0.1 with a random port and opens `http://127.0.0.1:<port>/#bootstrap=<one-time token>`.
2. The page posts the bootstrap token and the root password to `/api/login`. The server derives the data key and sets an `HttpOnly`, `SameSite=Strict` session cookie.
3. Every later request is checked for the cookie, the `Host` header and the `Origin` header.
4. Logout, Ctrl+C, or 10 minutes without a request ends the process and with it the key.

### Write to the vault

Every writer does the same thing: take `vault.lock`, read and verify the current file, change it in memory, copy the old file to `vault.json.bak`, write a temp file, fsync, rename it over `vault.json`, release the lock. Details are in [vault-format.md](./vault-format.md).

## Source layout

Planned layout of `workspace/`. Dependencies point downward only: `cli`, `mcp`, `gui` and `agent` import `core`; `core` imports nothing of theirs.

```text
workspace/
  package.json            version lives here
  tsconfig.json           noEmit, erasableSyntaxOnly, checkJs for ui/
  bin/akbun-keychain      node launcher for a checkout
  src/
    core/
      errors.ts           error codes and KeychainError
      paths.ts            home directory, file names, socket endpoint
      canonical.ts        canonical JSON used for AAD and the MAC
      crypto.ts           scrypt, HKDF, AES-256-GCM, HMAC
      vault-file.ts       parse, validate, serialize vault.json
      lockfile.ts         vault.lock acquire, stale check, release
      vault.ts            operations on an unlocked vault
      policy.ts           what a session may do without the root password
      audit.ts            append to audit.jsonl
    agent/
      protocol.ts         request and response types, error codes
      server.ts           socket server, timeouts
      client.ts           used by cli and mcp
      spawn.ts            start the detached agent, hand over the key
      run.ts              spawn a child with secrets
      mask.ts             replace values in output streams
    cli/
      main.ts             entry point, top-level help, error to exit code
      command.ts          command type, parser, help renderer
      io.ts               stdin, hidden password and value input
      commands/           the command table (index.ts) and commands grouped by area
    mcp/
      server.ts           stdio server and tool definitions
    gui/
      server.ts           node:http server, routes, session
    resources.ts          reads ui/ from disk or from the compiled binary
    version.ts            version read from package.json
  ui/
    index.html
    js/                   plain ES modules, type-checked through JSDoc
    css/
  scripts/build-binary.ts bun build --compile wrapper
  test/                   node --test, no binary needed
```
