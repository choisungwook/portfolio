# AI uses the user's Codex App Server

## Decision

The app starts a separately installed `codex app-server --listen stdio://` process and accepts only its ChatGPT account login. It does not bundle Codex, copy credentials or support API key authentication.

Each Codex thread is ephemeral and runs with approval disabled, network access off and no shell, web, MCP, plugin, app, hook, memory or multi-agent tools. The model receives only a measured project summary; asset paths and media contents stay outside the prompt.

The app owns at most three durable sessions of 128 MiB each. Closed and restored sessions are read-only. Generated images are copied into the session and can be saved elsewhere, but are not imported into the project because projects reference media paths and deleting a session would break such a reference.

Applying model output to timeline edits remains part of Issue #678.
This authentication path replaces the provider API key storage direction in Issue #772.

## Reason

The Codex login remains the user's single credential boundary. App-owned sessions make retention, deletion and capacity predictable without coupling the product to Codex thread history. Ephemeral restricted threads limit the data and capabilities exposed to the model.
