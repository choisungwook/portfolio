# Development

## Build and test

```bash
cd workspace
uv sync
uv run pytest
```

Tests need no login, no network, and no agent backend: every command test
injects the `FakeBackend` from `tests/conftest.py`. Keep it that way — the CI
verify job depends on it.

## Run against the sample MSA

```bash
cd workspace/fixtures/sample-msa
uv run --directory ../../ akbun-agent-k8s --config akbun-agent.toml learn
uv run --directory ../../ akbun-agent-k8s --config akbun-agent.toml status
```

The `learn` step needs a real backend: either `ANTHROPIC_API_KEY` in the
environment, or `--provider codex` with a logged-in codex CLI. The generated
`knowledge/` directory under the fixture is gitignored.

## Release

- Version lives in `workspace/pyproject.toml` only. Bump it in the same commit
  as any `workspace/` change: patch for fixes, minor for features
  (.claude/rules/product.md).
- On master push, `.github/workflows/release-akbun-agent-k8s.yml` reads that
  version, fails early if the tag `akbun-agent-k8s-v<version>` already exists,
  re-runs the tests, then creates the tag and a GitHub release. There is no
  build artifact; users install from the tag with `uv tool install git+...`.
- Pull requests run the verify job only (tests). A green PR is not a shipped
  release — after merging, check the master run of the workflow.

## Caveats

- claude-agent-sdk is pinned `>=0.2,<0.3`. The backend touches a small API
  surface (`query`, `ClaudeAgentOptions`, `AssistantMessage`, `TextBlock`,
  `ResultMessage`); check those names when raising the pin.
- The Claude backend requires `ANTHROPIC_API_KEY`. Anthropic does not allow
  claude.ai subscription login for apps built on the Agent SDK, so do not try
  to wire it up.
- The codex backend depends on these `codex exec` flags: `--sandbox`, `--cd`,
  `--skip-git-repo-check`, `--output-last-message`. They were verified against
  the codex source (codex-rs/exec/src/cli.rs) in 2026-08; re-check with
  `codex exec --help` when bumping the required codex version.
- `permission_mode="dontAsk"` plus `allowed_tools` is what makes claude runs
  non-interactive. `allowed_tools` alone still prompts for unlisted tools, and
  `bypassPermissions` approves everything including writes — do not switch to
  either.
- Python code in this repository uses 2-space indent (.claude/rules/python.md);
  configure your editor before touching workspace/.
