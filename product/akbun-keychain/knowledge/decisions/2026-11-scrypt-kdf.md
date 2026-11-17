---
type: Decision
title: Derive the key-encryption key with scrypt, with parameters stored in the file
description: scrypt N=2^17 from node:crypto; Argon2id was the first choice but is missing from the checkout runtime.
tags: [crypto, kdf]
generated: { by: claude-code, at: 2026-11-17T00:00:00Z }
---

## 결정

The root password is stretched with scrypt (N=2^17, r=8, p=1, 16-byte salt, 32-byte output). The KDF name and parameters are written in `vault.json` and read back from it, with a floor of N=2^15 that a reader enforces.

## 이유

- The product implements no cryptography and adds no crypto package, so the KDF has to exist in `node:crypto` on both runtimes: Node for a checkout and tests, bun for the released binary.
- Argon2id is the current general recommendation and was the first choice. Measured on 2026-11-17: `crypto.argon2Sync` exists in bun 1.4.4 and not in Node 22. Whether the Node 24 release used for a checkout has it was not measured. A KDF that exists on one of the two runtimes would mean tests that cannot open the vaults the binary writes.
- A package implementing Argon2id (native addon or WebAssembly) was rejected: a native addon complicates the three-platform binary, and either is one more thing to audit in the one place that guards every secret.
- scrypt is memory-hard and accepted for password storage. The same script measured about 0.4 seconds per derivation on both runtimes at these parameters, which a person does not notice at unlock and an attacker pays per guess.
- Because the parameters live in the file, moving to Argon2id later is a re-wrap of the data key at the next password entry, not a format break.
