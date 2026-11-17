# Security model

## What it protects against

| Threat | Defense |
|---|---|
| Someone or something reads or copies `vault.json` (an agent with file access, a backup, a synced folder) | Values are encrypted with a key that exists only while a human has typed the root password |
| An agent edits `vault.json` to loosen a key's access level | Every entry's metadata is authenticated with the data key. An edited entry fails to decrypt |
| An entry is removed from or swapped inside the file | A file-level MAC over all entries fails |
| A secret value lands in a model transcript or a log by accident | The default access level injects the value into a child process and masks it in the returned output |
| An agent with a shell changes an entry, a policy or the password | Those operations require the root password, which the agent does not have |
| Another OS user on the same machine | Directory mode 0700, files 0600, and a session token on every agent request |
| A web page in the user's browser calls the GUI server | Session cookie with `SameSite=Strict`, `Host` and `Origin` checks, a one-time bootstrap token, no CORS headers |

## What it does not protect against

Write these into the user manual as well; a secret store that overstates itself is worse than none.

- A process running as the same OS user while the vault is unlocked. It can call `run` and make the child print a transformed value (reversed, split, hashed with a known input). Masking catches the plain value and its base64, hex and URL-encoded forms only, and for a value shorter than 8 characters the plain form only. Masking prevents accidents, not a determined process.
- The same process reading the agent's memory with a debugger.
- A keylogger or a fake prompt that captures the root password.
- Rolling the whole file back to an older copy. The MAC proves the file is one the vault wrote, not that it is the newest.
- Key names, descriptions and tags. They are plaintext so that a person can read the file. Do not put secrets in them.
- A forgotten root password. There is no recovery path.
- JavaScript cannot wipe strings from memory. The data key is kept in a `Buffer` and zeroed on lock; decrypted values are short-lived strings that the garbage collector frees later.

For a secret that must never be reachable by an agent, set its access level to `deny`.

## Key hierarchy

The hierarchy as a diagram:

```text
root password
   | scrypt (N=2^17, r=8, p=1, 16-byte salt)      parameters stored in vault.json
   v
key-encryption key (32 bytes)
   | AES-256-GCM unwrap
   v
data key (32 random bytes, generated at init)
   | HKDF-SHA256, salt = vault_id
   +-- info "akbun-keychain/entry" -> entry key  (AES-256-GCM per entry)
   +-- info "akbun-keychain/mac"   -> MAC key    (HMAC-SHA256 over the entry set)
```

- Changing the root password re-wraps the data key and touches no entry.
- Each entry is encrypted with a fresh random 12-byte nonce. Its additional authenticated data is the canonical JSON of the entry's metadata, the vault id and the format version.
- All primitives come from `node:crypto`. No cryptography is implemented in this product and no crypto package is added.
- The KDF name and parameters are read from the file, so a later version can move to Argon2id without breaking old vaults. See [the decision](../knowledge/decisions/2026-11-scrypt-kdf.md).

## The access rule

The rule does not depend on guessing whether the caller is a human or an agent. It depends on one thing: whether the caller supplied the root password for this operation.

| Operation | Unlocked session is enough | Root password required |
|---|---|---|
| Status, list metadata, read the audit log | yes | |
| Run a command with `inject` or `reveal` keys | yes | |
| Read the value of a `reveal` key | yes | |
| Create a key under a new name | yes, and `ai_access` is forced to `inject` | |
| Read the value of an `inject` or `deny` key | | yes |
| Use a `deny` key in any way | | yes |
| Overwrite, edit, rename, delete an existing key | | yes |
| Change a key's `ai_access` | | yes |
| Change the root password, log in to the GUI | | yes |

Each key has one access level, `ai_access`:

| Level | Meaning |
|---|---|
| `inject` (default) | Usable through `run`. The value is never returned to the caller |
| `reveal` | Also readable as a value by a session. For values that are not very sensitive and that a tool needs as text |
| `deny` | A session sees its name and level only, not its description or tags, and cannot use it. Human only, with the root password |

Reasons are in [the decision](../knowledge/decisions/2026-11-root-password-gates-mutations.md).

## Password handling

- The root password is read from the terminal with echo off, or from stdin with `--password-stdin`. It is never accepted as an argument or an environment variable, because both are visible to other processes and end up in shell history.
- Secret values follow the same rule: hidden prompt or stdin, never an argument.
- Minimum length is 12 characters. No composition rules.
- In the GUI, five failed logins end the server process. scrypt already costs about 0.4 seconds per attempt.

## Agent session

- Endpoint: a Unix domain socket `agent.sock` in the home directory on macOS and Linux, a named pipe on Windows.
- Every request carries the session token from `agent.json`. On Windows this is the main defense, because a named pipe created by Node is not limited to its owner by default.
- Timeouts: 15 minutes idle, 8 hours absolute. `unlock --ttl` changes the idle timeout up to the absolute limit.
- On timeout or `lock` the agent zeroes the data key, removes `agent.json` and the socket, and exits.
- Children spawned for `run` are killed when the requesting connection closes or the timeout passes.

## Audit log

Every operation that touches a key appends a line to `audit.jsonl`: time, actor (`cli`, `mcp`, `gui`), operation, key name, result, and for `run` the program name and the variable names. Values and full command lines are never logged, because arguments can carry secrets. The log is plaintext and not tamper-proof; it answers "what did the agent use", not "prove nothing else happened".
