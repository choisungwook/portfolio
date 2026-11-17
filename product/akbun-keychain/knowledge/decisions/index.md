# Decisions

작업 중 내린 의사결정을 "결정 - 이유" 구조로 기록한다. 파일명은 `YYYY-MM-<주제>.md` 형식을 사용한다.

## 목록

* [Write everything in TypeScript on Node and release a bun-compiled binary](2026-11-typescript-node-bun-stack.md) - One language for the CLI, agent, MCP server and page; Go and Rust were rejected.
* [Store the vault as one readable JSON file with per-entry encryption and a lock file](2026-11-json-vault-per-entry-encryption.md) - Metadata is plaintext and authenticated, values are encrypted one by one; SQLite and a single encrypted blob were rejected.
* [A background agent holds the data key after the human unlocks](2026-11-agent-holds-data-key.md) - ssh-agent pattern over a local socket; OS keychains, a password per call and a key file were rejected.
* [The root password, not caller detection, decides what an operation may do](2026-11-root-password-gates-mutations.md) - A session may use and create; revealing protected values and changing anything existing need the password.
* [Derive the key-encryption key with scrypt, with parameters stored in the file](2026-11-scrypt-kdf.md) - scrypt N=2^17 from node:crypto; Argon2id was the first choice but is missing from the checkout runtime.
* [The page follows IBM Carbon through the token contract akbun-taskq already has](2026-11-carbon-design-system.md) - Carbon tokens and rules are copied from akbun-taskq; the Carbon packages are not added.
