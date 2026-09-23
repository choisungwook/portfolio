# Development

## Run

Start the app from source:

```bash
cd workspace
npm install
npm start
```

## Test

Tests cover every parser, the aggregation, the display and the update cleanup points. None of them imports electron, so they run without the binary:

```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm test
```

A quick look at what the app would show on this machine, without Electron:

```bash
node -e "
const { collect } = require('./src/collect');
const { formatTitle, sectionLines } = require('./src/format');
const { DEFAULTS } = require('./src/settings');
collect(DEFAULTS).then((sections) => {
  console.log(formatTitle(sections));
  for (const s of sections) console.log(s.name, sectionLines(s, Date.now()));
});"
```

## Release

1. Bump `version` in `workspace/package.json` in the same PR as the change.
2. A PR runs the `verify` job on ubuntu: tests only.
3. A master push runs `release` on macOS: tests, unsigned arm64 dmg, tag `akbun-ai-useage-v<version>`, then the GitHub release.
4. Check `gh run list --workflow=release-akbun-ai-useage.yml` after merging. A green PR is not a release.

## Caveats

- The OAuth usage endpoint and the Codex and Kiro formats are undocumented. When a number disappears, compare a fresh log line or CLI output against the parser first.
- Claude limits are off by default. They reuse the Claude Code login token, and macOS may ask for keychain access on the first refresh.
- The Admin API buckets start at UTC midnight while "Today" starts at local midnight, so org "Today" is off by the timezone offset.
- `kiro-cli` is looked up with `~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin` added to PATH, because a Finder launch gets a bare PATH. Set `kiro.command` to an absolute path if it lives elsewhere.
- settings.json holds admin keys in plain text with mode 0600.
- Windows and Linux: the code runs, but no build ships and the dmg swap is macOS only. Shipping Windows means adding an NSIS target and electron-updater with `verifyUpdateCodeSignature: false`.
