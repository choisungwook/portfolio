---
type: Decision
title: Rust with a small synchronous stack for the terraform PR server
description: akbun-terraform-apply-remote is written in Rust using tiny_http and ureq instead of an async framework, with unit tests only on the core logic.
tags: [rust, product, automation]
timestamp: 2026-07-29T00:00:00Z
---

## Decision

akbun-terraform-apply-remote is a Rust binary built on a synchronous stack: tiny_http for the webhook listener, ureq for GitHub API calls, and hmac/sha2 for signature verification. No async runtime or web framework. Webhook deliveries are acknowledged immediately and processed on plain spawned threads. Automated tests cover only the pure core logic (command parsing, signature verification, project detection, comment formatting, lock manager); the GitHub client, git workspace, and terraform runner are thin process/HTTP wrappers left untested.

## Reason

- The workload is a handful of webhook deliveries per day, each dominated by a terraform run that takes seconds to minutes. An async runtime (tokio + axum) buys nothing here and roughly triples the dependency tree, which slows CI builds and enlarges the audit surface.
- Rust gives a single static release binary, so deploying to any Linux host is copy-and-run — no runtime, no package manager on the server.
- The code is maintained by AI agents, not read line-by-line by the owner. The guardrail is therefore the test suite on the decision-making core, where a regression silently changes what gets applied to infrastructure. The untested modules only shell out to git/terraform or call the GitHub REST API; their failures are loud (error comments, non-zero exits), not silent.
- Blocking I/O with one thread per event keeps the orchestration code straight-line and easy for an agent to modify correctly; shared state is limited to two mutex-guarded maps (locks, planned SHAs).
