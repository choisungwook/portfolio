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

1. Pick the stack. **Tauri is the default for a desktop app.** See "Choosing the stack" below. Build the app in workspace/, preferring the laziest thing that works and reusing patterns from an existing product of the same stack. Keep tests runnable without an app binary, so CI verify needs no webview and no Electron download.
2. Keep the version in package.json. It drives the tag, the release name, and the self update check. In Tauri, point tauri.conf.json at it with `"version": "../package.json"` rather than copying the number.
3. Add self update to any desktop app. In Tauri that is the official updater plugin; in Electron see "Self update in Electron" below.
4. Create .github/workflows/release-<name>.yml modeled on the workflow of the product you reused:
   - Check the latest stable major of every action (actions/checkout, actions/setup-node, tauri-apps/tauri-action) and tool before writing it; never copy old pins.
   - pull_request runs a verify job on ubuntu, tests only. Electron needs ELECTRON_SKIP_BINARY_DOWNLOAD.
   - master push builds and releases. In Electron, build then tag then release, so a failed build leaves no dangling tag. In Tauri, tauri-action creates the release and GitHub creates the tag from it, so there is no git tag step.
   - Unsigned builds need the platform's bypass in the release notes. macOS:

     ```bash
     xattr -cr /Applications/<name>.app
     ```

     Windows: tell the user to choose "More info" and then "Run anyway" past the SmartScreen warning.

5. Write wiki/: index.md, architecture.md (process structure, key flows, IPC or API surface), development.md (build, run, test, release, caveats). No marketing language, no references to benchmarked products or PR bodies.
6. Write adr/ with index.md plus one file per decision (YYYY-MM-<topic>.md), each with Decision and Reason sections.
7. Update both indexes in the same commit: the product/README.md table and the root README.md "직접 만든 제품" list.

## Choosing the stack

Default to Tauri, in plain JavaScript with no build step, following .claude/rule-details/tauri.md. Reuse akbun-folderview. It ships an installer under 10 MB against roughly 90 MB for the same app in Electron, the page is ordinary HTML and CSS, and the release action produces the installer, the signature and the update manifest in one step.

Choose Electron instead when one of these is true, and record which one in an ADR:

- The app needs a macOS or Linux build now. Tauri renders in each platform's own webview, so the UI has to be checked on every platform shipped. Electron carries one engine everywhere.
- The app needs a tray or menu bar icon as its primary surface. akbun-screenshot and akbun-mactaskbar are there for a reason.
- The app depends on a node library with no Rust equivalent, and porting it is larger than the size saving.
- The work is a change to an existing Electron product. Do not rewrite a working app to change its framework unless asked.

For Electron, reuse akbun-screenshot for plain JavaScript and akbun-k8supgradeview when TypeScript earns its build step.

Swift is a third option and almost always the wrong one. akbun-mactaskbar went native only because Electron could not reach the AppKit APIs it needed. Absent that, a rewrite costs the working app and closes the door on other platforms.

## Self update in Electron

Only for the Electron path; Tauri uses the updater plugin described in .claude/rule-details/tauri.md.

On macOS, Squirrel.Mac cannot install an unsigned build, so copy the working implementation instead of inventing one: akbun-k8supgradeview/workspace/src/main/update.ts with its main.ts update flow and its disk leak test. akbun-mactaskbar/workspace/src/update.js is the same code as plain JavaScript.

On Windows this hand-rolled path is not needed. electron-updater installs unsigned NSIS builds when `verifyUpdateCodeSignature` is `false`, which is documented for exactly that case. Do not carry the macOS reasoning over to Windows; that mistake shipped once already.

What the macOS port must keep:

- Read the repository releases from the GitHub API, match tags prefixed `<name>-v`, and pick the dmg for `process.arch`. electron-builder suffixes arm64 only.
- Compare versions numerically, not as strings, against `app.getVersion()`.
- Stream the dmg to a temp directory, then spawn a detached bash script and quit. A running app cannot overwrite itself. The script waits on the pid, mounts the dmg, copies with `ditto`, moves the old bundle back on failure, clears extended attributes and relaunches. A file the app downloaded itself carries no quarantine attribute, which is why Gatekeeper does not block the replacement.
- Keep all three temp cleanup points, because the dmg is large and a leak fills the disk quietly: the downloader removes its directory on failure, the script traps EXIT, and a sweep at app start clears what a kill left behind. Port the test that fails when any of the three disappears from the source.
- Only offer to install from a packaged build. Under npm start the bundle to replace is Electron.app.

Reach it from the app menu or the tray context menu as "Check for Updates…".

## Rules

- Follow .claude/rule-details/product.md, markdown.md, and the stack rules: tauri.md by default, electron.md when the reasons above apply.
- Do not commit, push, or create Issues/PRs unless the user explicitly asks; /repo-pr-create handles that.
