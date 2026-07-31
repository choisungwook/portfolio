---
description: Create a new product under product/ with source, wiki, ADR, and a release workflow
argument-hint: <product-name> <what the product does>
---

Create a complete product under product/. The product name is $1 and must start with akbun (for example akbun-screenshot). The remaining arguments describe what to build; if missing, decide from the conversation.

Write everything in concise English: source comments, wiki, ADR, README, workflow, and release notes.

## Directory layout

```text
product/<name>/
  README.md      # what it is, directory table, quick start
  workspace/     # source code and build config, with its own .gitignore
  wiki/          # llm wiki the next agent reads before taking over
  adr/           # decision records
```

## Steps

1. Build the app in workspace/. Prefer the laziest stack that works; reuse patterns from existing products (akbun-k8supgradeview is the reference). Keep tests runnable with plain node so CI verify needs no app binary.
2. Manage the version in a source file (package.json version or equivalent). The version drives the git tag and release name.
3. Create .github/workflows/release-<name>.yml modeled on release-k8supgradeview.yml:
   - Check the latest stable major versions of every action (actions/checkout, actions/setup-node) and tool before writing them; never copy old pins.
   - pull_request runs a verify job (tests only, no app binary).
   - master push reads the version, runs tests, builds, then creates tag <name>-v<version>, then the GitHub release. Build before tag, tag before release.
   - For unsigned macOS builds, the release notes must include a code block with the Gatekeeper bypass:

     ```bash
     xattr -cr /Applications/<name>.app
     ```

4. Write wiki/ for the next agent: index.md, architecture.md (process structure, key flows, IPC or API surface), development.md (build, run, test, release, caveats). No marketing language, no references to benchmarked products or PR bodies.
5. Write adr/ with index.md plus one file per decision (YYYY-MM-<topic>.md), each with Decision and Reason sections.
6. Update both indexes in the same commit: the product/README.md table and the root README.md "직접 만든 제품" list.

## Rules

- Follow .claude/rules/product.md, markdown.md, and the language-specific rules.
- Do not commit, push, or create Issues/PRs unless the user explicitly asks; /repo-pr-create handles that.
