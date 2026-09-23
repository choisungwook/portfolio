# akbun-ai-useage

Menu bar app that shows how much Claude Code, Codex and Kiro have been used. The menu bar title carries one number per tool, for example `C 33% · X 72% · K 61%`: the tightest subscription limit when one is known, otherwise today's tokens. Clicking it opens a menu with every source in detail.

| Source | What it shows | Where it comes from |
|---|---|---|
| Claude Code | Tokens for today, 7 days, 30 days. 5 hour and weekly limits when enabled | `~/.claude/projects/**/*.jsonl`, the Claude Code OAuth usage endpoint |
| Codex | Tokens and the 5 hour and weekly limits | `~/.codex/sessions/**/*.jsonl` |
| Kiro | Plan, credits used of the plan, monthly reset | `kiro-cli chat /usage` |
| Anthropic org | Organization tokens and cost | Anthropic Admin API, needs an admin key |
| OpenAI org | Organization tokens and cost | OpenAI Admin API, needs an admin key |

Local logs count usage on this machine under any plan, subscription or API key. The Admin API sources count the whole organization, which is the only view of Enterprise or API usage that did not go through this machine.

Built with Tauri and Rust, with no webview UI: the tray menu is native on every platform. The release binary is about 7 MB. The app is macOS first; the code builds on Windows and Linux, but only a macOS dmg ships for now.

## Directory layout

| Directory | Description |
|---|---|
| `workspace/` | App source code and build config. Development happens here |
| `wiki/` | Project notes the next agent reads before taking over |
| `adr/` | Architecture decision records |
| `knowledge/` | OKF knowledge bundle for this workspace |

## Quick start

Install the Tauri CLI and launch the app. Rust stable is required:

```bash
cd workspace
npm install
npm start
```

The first run writes `settings.json` into the app data directory. Open it from the menu with Open Settings File… to turn on Claude limits or add admin keys:

```json
{
  "refreshMinutes": 5,
  "claude": { "enabled": true, "limits": true },
  "codex": { "enabled": true },
  "kiro": { "enabled": true, "command": "kiro-cli" },
  "anthropicAdmin": { "apiKey": "sk-ant-admin..." },
  "openaiAdmin": { "apiKey": "sk-admin-..." }
}
```

The file is reread on every refresh, so Refresh Now applies an edit.
