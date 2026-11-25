# Knowledge Update Log

concept를 추가·수정·삭제할 때마다 오늘 날짜 섹션을 맨 위에 만들고 한 줄 남긴다. 구분은 `**Creation**`, `**Update**`, `**Deletion**`이다.

## 2026-11-25

* **Update**: 번들의 OKF 0.2 스펙 사본을 지우고 저장소 루트의 `templates/okf-spec-0.3.md`를 참조하도록 바꾸고, 번들 index의 okf_version을 0.3으로 변경.

## 2026-11-17

* **Creation**: [Write the MCP server on the SDK's low-level Server with JSON Schema tool inputs](decisions/2026-11-mcp-low-level-server.md) 결정 기록. McpServer with zod schemas was rejected to keep the SDK the only runtime dependency.
* **Creation**: [Let tests lower scrypt N through AKBUN_KEYCHAIN_TEST_KDF_N](decisions/2026-11-test-kdf-env.md) 결정 기록. CLI tests use N=2^15; the reader still refuses anything lower.

* **Creation**: [The page follows IBM Carbon through the token contract akbun-taskq already has](decisions/2026-11-carbon-design-system.md) 결정 기록. Carbon tokens and rules are copied from akbun-taskq; the Carbon packages are not added.
* **Creation**: [Write everything in TypeScript on Node and release a bun-compiled binary](decisions/2026-11-typescript-node-bun-stack.md) 결정 기록. One language for the CLI, agent, MCP server and page; Go and Rust were rejected.
* **Creation**: [Store the vault as one readable JSON file with per-entry encryption and a lock file](decisions/2026-11-json-vault-per-entry-encryption.md) 결정 기록. Metadata is plaintext and authenticated, values are encrypted one by one; SQLite and a single encrypted blob were rejected.
* **Creation**: [A background agent holds the data key after the human unlocks](decisions/2026-11-agent-holds-data-key.md) 결정 기록. ssh-agent pattern over a local socket; OS keychains, a password per call and a key file were rejected.
* **Creation**: [The root password, not caller detection, decides what an operation may do](decisions/2026-11-root-password-gates-mutations.md) 결정 기록. A session may use and create; revealing protected values and changing anything existing need the password.
* **Creation**: [Derive the key-encryption key with scrypt, with parameters stored in the file](decisions/2026-11-scrypt-kdf.md) 결정 기록. scrypt N=2^17 from node:crypto; Argon2id was the first choice but is missing from the checkout runtime.
