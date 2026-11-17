# Vault format

## Files

Everything lives in one directory: `~/.akbun-keychain/`, or the path in `AKBUN_KEYCHAIN_HOME`. The directory is mode 0700 and every file 0600. On Windows the user profile's default ACL gives the same effect.

| File | Content | Lifetime |
|---|---|---|
| `vault.json` | Header and all entries | permanent |
| `vault.json.bak` | The file as it was before the last write | replaced on each write |
| `vault.lock` | Writer lock: pid and time | during a write |
| `audit.jsonl` | One JSON object per line | rotated to `audit.jsonl.1` at 5 MiB |
| `agent.json` | Agent pid, endpoint, session token, expiry | while unlocked |
| `agent.sock` | Agent socket, macOS and Linux only | while unlocked |

No database. The data is a few dozen small records read whole and written whole; see [the decision](../knowledge/decisions/2026-11-json-vault-per-entry-encryption.md).

## vault.json

The file is pretty-printed with two-space indent, entries sorted by name, and a trailing newline, so that a person can read it and a diff is small.

An example with one entry:

```json
{
  "format": "akbun-keychain/1",
  "vault_id": "0b7f3c1e-5a52-4c0e-9d0c-3f1f6f0e2a11",
  "kdf": {
    "name": "scrypt",
    "N": 131072,
    "r": 8,
    "p": 1,
    "salt": "c2FsdHNhbHRzYWx0c2FsdA=="
  },
  "wrapped_key": {
    "alg": "aes-256-gcm",
    "nonce": "bm9uY2Vub25jZW5v",
    "ciphertext": "…"
  },
  "entries": {
    "github/personal-token": {
      "description": "Fine-grained token, repo read only",
      "tags": ["github"],
      "ai_access": "inject",
      "created_at": "2026-11-17T09:00:00Z",
      "updated_at": "2026-11-17T09:00:00Z",
      "version": 1,
      "value": {
        "nonce": "bm9uY2Vub25jZW5v",
        "ciphertext": "…"
      }
    }
  },
  "mac": "…"
}
```

Field rules:

| Field | Rule |
|---|---|
| `format` | `akbun-keychain/1`. A reader refuses any other value |
| `vault_id` | Random UUID set at init. Binds entries to this vault |
| `kdf` | Name and parameters. A reader refuses `N` below 2^15 so an edited file cannot weaken the derivation |
| `wrapped_key` | The data key encrypted with the key-encryption key. `ciphertext` is ciphertext followed by the 16-byte tag, base64 |
| entry name | The object key. Matches `^[a-z0-9][a-z0-9._-]*(/[a-z0-9][a-z0-9._-]*)*$`, at most 128 characters |
| `description` | Plaintext, at most 500 characters |
| `tags` | Plaintext, sorted, each matching `^[a-z0-9][a-z0-9._-]*$` |
| `ai_access` | `inject`, `reveal` or `deny` |
| `version` | Starts at 1, incremented on every change to the entry |
| `value` | 12-byte random nonce and ciphertext with tag, base64. The plaintext is UTF-8, at most 64 KiB, and may span lines |
| `mac` | HMAC-SHA256, base64 |

## What is authenticated

Canonical JSON means: object keys sorted, no whitespace, `JSON.stringify` for scalars. One function, `canonical()`, produces it everywhere.

| Item | Additional authenticated data or MAC input |
|---|---|
| `wrapped_key` | `canonical({format, vault_id, kdf})` |
| entry `value` | `canonical({format, vault_id, name, description, tags, ai_access, created_at, updated_at, version})` |
| `mac` | `canonical({format, vault_id, entries: {<name>: {version, ciphertext}}})` for every entry |

Consequences:

- A person can read the file but must not edit it by hand. A hand-edited description makes that entry fail authentication. This is deliberate: `ai_access` sits in the same file, and an unauthenticated policy field could be loosened by anything that can write the file.
- An entry whose `description`, `tags`, `ai_access` or timestamps were edited fails by itself: it is reported by name and the other entries keep working.
- A failed `mac` (entry removed, added, renamed, its `version` edited, or replaced by an older copy) fails closed: every operation returns the integrity error until the user restores `vault.json.bak` or runs `verify` to see what differs.

## Writing

1. Create `vault.lock` with the exclusive flag (`wx`). It holds `{pid, at}`.
2. If it exists: when its pid is not alive or it is older than 30 seconds, remove it and retry; otherwise retry every 50 ms for up to 5 seconds, then fail with the lock error.
3. Read `vault.json` and verify the MAC. Never reuse a copy read before taking the lock; that is how a concurrent update gets lost.
4. Apply the change in memory, bump the entry `version`, set `updated_at`, recompute the MAC.
5. Copy the current file to `vault.json.bak`.
6. Write `vault.json.tmp-<pid>` with mode 0600, fsync, rename over `vault.json`.
7. Remove `vault.lock`.

Readers take no lock. The rename is atomic, so a reader sees the old file or the new one. On Windows a rename over a file another process has open can fail with `EPERM`; retry up to 10 times at 20 ms.

## audit.jsonl

One line per operation, appended with a single write:

```json
{"at":"2026-11-17T09:12:03Z","actor":"mcp","op":"run","keys":["github/personal-token"],"ok":true,"program":"gh","env":["GH_TOKEN"],"exit_code":0}
```

| Field | Content |
|---|---|
| `actor` | `cli`, `mcp` or `gui` |
| `op` | `create`, `update`, `delete`, `rename`, `reveal`, `run`, `unlock`, `lock`, `passwd`, `login` |
| `keys` | Key names involved |
| `ok`, `code` | Result, and the error code when it failed. Denied attempts are logged too |
| `program`, `env` | For `run`: the first element of the command and the variable names. Not the arguments |
