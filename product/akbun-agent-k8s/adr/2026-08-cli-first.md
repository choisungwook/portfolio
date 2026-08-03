# CLI first, desktop later as a shell around it

## Decision

Ship a terminal CLI written in Python (uv-managed), with the agent logic in
importable modules behind a thin argparse layer. A future desktop app wraps
the CLI as a sidecar process instead of relinking the logic.

## Reason

The value of this product is the agent loop and the knowledge format, and both
are unproven; a CLI is the shortest path to running them against a real MSA.
Desktop frameworks in this repository (Tauri per .claude/rules/tauri.md) run
web frontends with a Rust core, so no desktop language choice is blocked by
the CLI being Python — a sidecar process boundary is how such apps integrate
CLIs anyway. Python was chosen over TypeScript because the repository already
carries Python rules and tooling, and the Claude Agent SDK ships equally in
both languages.
