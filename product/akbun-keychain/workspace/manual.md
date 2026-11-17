# akbun-keychain manual

A local secret store for AI agents. Secrets live encrypted in one JSON file. An agent uses a secret by name through `run` or MCP, and the value never enters its context.

## Install

Download the archive for your platform from the GitHub release `akbun-keychain-v<version>`, extract it, and put `akbun-keychain` on PATH.

- macOS (Apple silicon): `akbun-keychain-darwin-arm64.tar.gz`. After a browser download, run `xattr -d com.apple.quarantine akbun-keychain` once; the binary is not signed.
- Linux x86_64: `akbun-keychain-linux-x64.tar.gz`.
- Windows x64: `akbun-keychain-windows-x64.zip`. On the SmartScreen warning choose "More info", then "Run anyway".

From a checkout instead, with Node 24 or later:

```bash
cd product/akbun-keychain/workspace
npm ci
node src/cli/main.ts version
```

## First use

Create the vault. The root password is asked twice, must be at least 12 characters, and cannot be recovered.

```bash
akbun-keychain init
```

Add secrets. The value is read from a hidden prompt, or from stdin.

```bash
akbun-keychain set github/token --tag github --description "fine-grained, repo read"
printf %s "$OPENAI_API_KEY" | akbun-keychain set openai/key
```

Let agents use the vault for a while. The agent stops after 15 minutes idle (change with `--ttl`, up to 8h), after 8 hours, or on `lock`.

```bash
akbun-keychain unlock
akbun-keychain lock
```

## Register the MCP server

For Claude Code:

```bash
claude mcp add akbun-keychain -- akbun-keychain mcp
```

The tools are `keychain_status`, `list_keys`, `run_with_secrets`, `get_secret` and `create_secret`. There is no tool that edits or deletes. While locked, every tool except `keychain_status` answers that the user must run `akbun-keychain unlock`.

## Daily use

What an agent does, through the shell or MCP:

```bash
akbun-keychain status
akbun-keychain list
akbun-keychain run --env GH_TOKEN=github/token -- gh repo list
```

The output of `run` comes back with every occurrence of the value replaced by `[masked:github/token]`.

What only you do, because it needs the root password:

```bash
akbun-keychain edit github/token --ai-access deny
akbun-keychain set github/token
akbun-keychain rm old/token
akbun-keychain passwd
akbun-keychain gui
```

`gui` opens a page on 127.0.0.1 to do the same in a browser. It stops on logout, Ctrl+C, 10 minutes idle, or the fifth wrong password.

Each key has one access level for agents:

| Level | An unlocked session can |
|---|---|
| `inject` (default) | use it through `run` only |
| `reveal` | also read the value with `get` or `get_secret` |
| `deny` | see its name only; nothing else |

`akbun-keychain audit` shows what was used, by whom (`cli`, `mcp`, `gui`). `akbun-keychain verify` checks the file after an integrity error.

Every command explains itself: `akbun-keychain <command> --help`, or `akbun-keychain help --json`.

## Files

Everything is in `~/.akbun-keychain/` or `$AKBUN_KEYCHAIN_HOME`: `vault.json`, `vault.json.bak` (the file before the last write), `audit.jsonl` and its rotations, and `agent.json` while unlocked. Do not edit `vault.json` by hand; an edited key fails authentication.

## Limits

Know these before relying on it.

- While unlocked, any process running as you can call `run` and make the child print a transformed value (reversed, split, hashed). Masking catches the plain value and its base64, hex and URL-encoded forms only, and only the plain form of values shorter than 8 characters. It prevents accidents, not a determined process. Use `deny` for a key no agent may touch.
- It does not protect against a debugger reading the agent's memory, a keylogger, or a fake password prompt.
- Rolling the whole file back to an older copy is not detected.
- Names, descriptions and tags are plaintext. Never put a secret in them.
- A forgotten root password cannot be recovered.
