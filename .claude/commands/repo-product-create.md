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

1. Build the app in workspace/. Prefer the laziest stack that works and reuse patterns from existing products: akbun-screenshot for a plain JavaScript Electron app, akbun-k8supgradeview when TypeScript earns its build step. Keep tests runnable with plain node, importing no electron, so CI verify needs no app binary.
2. Keep the version in package.json or the equivalent source file. It drives the git tag, the release name, and the self update check.
3. Add self update to any desktop app, ported from akbun-k8supgradeview. See "Self update" below.
4. Create .github/workflows/release-<name>.yml modeled on release-akbun-screenshot.yml:
   - Check the latest stable major of every action (actions/checkout, actions/setup-node) and tool before writing it; never copy old pins.
   - pull_request runs a verify job on ubuntu with ELECTRON_SKIP_BINARY_DOWNLOAD, tests only.
   - master push reads the version, runs tests, builds, then creates tag <name>-v<version>, then the release. Build before tag, tag before release, so a failed build leaves no dangling tag.
   - For unsigned macOS builds the release notes must include the Gatekeeper bypass:

     ```bash
     xattr -cr /Applications/<name>.app
     ```

5. Write wiki/: index.md, architecture.md (process structure, key flows, IPC or API surface), development.md (build, run, test, release, caveats). No marketing language, no references to benchmarked products or PR bodies.
6. Write adr/ with index.md plus one file per decision (YYYY-MM-<topic>.md), each with Decision and Reason sections.
7. Update both indexes in the same commit: the product/README.md table and the root README.md "직접 만든 제품" list.

## Self update

Builds are unsigned, so Squirrel.Mac and electron-updater cannot install. Copy the working implementation instead of inventing one: akbun-k8supgradeview/workspace/src/main/update.ts with its main.ts update flow and its disk leak test. akbun-mactaskbar/workspace/src/update.js is the same code as plain JavaScript.

What the port must keep:

- Read the repository releases from the GitHub API, match tags prefixed `<name>-v`, and pick the dmg for `process.arch`. electron-builder suffixes arm64 only.
- Compare versions numerically, not as strings, against `app.getVersion()`.
- Stream the dmg to a temp directory, then spawn a detached bash script and quit. A running app cannot overwrite itself. The script waits on the pid, mounts the dmg, copies with `ditto`, moves the old bundle back on failure, clears extended attributes and relaunches. A file the app downloaded itself carries no quarantine attribute, which is why Gatekeeper does not block the replacement.
- Keep all three temp cleanup points, because the dmg is large and a leak fills the disk quietly: the downloader removes its directory on failure, the script traps EXIT, and a sweep at app start clears what a kill left behind. Port the test that fails when any of the three disappears from the source.
- Only offer to install from a packaged build. Under npm start the bundle to replace is Electron.app.

Reach it from the app menu or the tray context menu as "Check for Updates…".

## Rules

- Follow .claude/rules/product.md, markdown.md, and the language-specific rules.
- Do not commit, push, or create Issues/PRs unless the user explicitly asks; /repo-pr-create handles that.
