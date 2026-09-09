# ADR

Decision records for akbun-wiki in decision-and-reason form.

## Contents

- [A separate service instead of a reader feature](2026-09-separate-service.md) - graphify is a Python CLI with a filesystem and an LLM backend; the reader Worker has neither.
- [Files first, SQLite as index](2026-09-files-then-sqlite.md) - graphify and LLM clients read folders; the API needs search and keys that survive a rebuild.
- [Read-only reader token and wiki API keys](2026-09-two-credentials.md) - Each side verifies one credential and the blast radius of a leak stays read-only.
