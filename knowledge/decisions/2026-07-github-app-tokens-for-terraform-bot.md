---
type: Decision
title: GitHub App installation tokens as the recommended auth for the terraform bot
description: akbun-terraform-apply-remote supports PAT and GitHub App auth; App mode mints cached one-hour installation tokens from an RS256 JWT and is the recommended option.
tags: [github, security, product, automation]
timestamp: 2026-07-29T00:00:00Z
---

## Decision

akbun-terraform-apply-remote authenticates with exactly one of two modes, selected by environment variables and validated at boot: a static fine-grained PAT (ATR_GITHUB_TOKEN), or a GitHub App (ATR_GITHUB_APP_ID, ATR_GITHUB_APP_PRIVATE_KEY_PATH, ATR_GITHUB_APP_INSTALLATION_ID). In App mode the server signs a short-lived RS256 JWT with the App private key, exchanges it for a one-hour installation token, caches it, and re-mints it ten minutes before expiry. Every GitHub API call and git fetch pulls the current token from this provider. App mode is documented as the recommended option; PAT stays supported for quick setups.

## Reason

- A terraform bot's token can post comments and read private repos; a long-lived PAT sitting on a server (or in an SSM parameter) is the kind of credential that leaks quietly. With App auth the only durable secret is a private key that never leaves disk, and the tokens actually in use expire within an hour and can be revoked centrally by uninstalling the App.
- Comments arrive under the App's bot identity instead of a person's account, which keeps the audit trail honest and survives people leaving.
- The token-provider abstraction (token per call, cached with a refresh margin) means long terraform runs never hold an expiring token, and no call site knows which auth mode is active — so both modes share one code path.
- Misconfiguration (both modes set, or partial App settings) fails at startup rather than on the first webhook, because an auth failure discovered mid-apply is much harder to diagnose.
