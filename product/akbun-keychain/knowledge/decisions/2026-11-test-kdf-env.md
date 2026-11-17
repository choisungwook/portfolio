---
type: Decision
title: Let tests lower scrypt N through AKBUN_KEYCHAIN_TEST_KDF_N, never below the reader's floor
description: CLI tests create vaults with N=2^15 instead of 2^17; the reader still refuses anything below 2^15.
tags: [testing, crypto, kdf]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-17T13:40:00Z }
---

## 결정

`init` reads `AKBUN_KEYCHAIN_TEST_KDF_N` and uses it as scrypt N for the new vault when it is an integer of at least 2^15. Otherwise it uses the default 2^17. Core tests pass the same value through `initVault(password, { kdfN })`.

## 이유

- The CLI tests run each command as its own process, and every password-gated command derives the key again. At 2^17 one derivation takes about 0.4 seconds and the suite would take minutes; at 2^15 it takes about 0.05 seconds.
- The variable cannot weaken a vault below what [the KDF decision](2026-11-scrypt-kdf.md) allows: values under 2^15 are ignored, and every reader refuses a file with N below 2^15.
- Rejected: a hidden CLI flag. A flag shows up in shell history and help tables, and the help is generated from the same table the parser reads.
