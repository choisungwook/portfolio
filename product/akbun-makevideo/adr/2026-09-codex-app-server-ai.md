# AI uses the user's Codex App Server

## Decision

The app starts a separately installed `codex app-server --listen stdio://` process and accepts only its ChatGPT account login. It does not bundle Codex, copy credentials or support API key authentication.

Each Codex thread is ephemeral and runs with approval disabled, network access off and no shell, web, MCP, plugin, app, hook, memory or multi-agent tools. Ordinary conversations receive a measured project summary. The [editing studio](../wiki/architecture/astra-editing.md) additionally sends path-redacted timeline and caption data, or explicitly selected B-roll samples.

The app owns at most three durable sessions of 128 MiB each. Closed and restored sessions are read-only. Generated images are copied into the session and can be saved elsewhere, but are not imported into the project because projects reference media paths and deleting a session would break such a reference.

- Model output is validated as an allowlisted proposal and applied through a snapshot-checked transaction after user review.
This authentication path replaces the provider API key storage direction in Issue #772.

## Reason

The Codex login remains the user's single credential boundary. App-owned sessions make retention, deletion and capacity predictable without coupling the product to Codex thread history. Ephemeral restricted threads limit the data and capabilities exposed to the model.
