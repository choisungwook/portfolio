# Hook & Skill Installer

`aimem install --agent <claude|codex|kiro|antigravity>` installs lifecycle hooks and `skills/aimemory/SKILL.md` idempotently while preserving existing agent configuration.

| Agent | Hook config | Skill destination |
|---|---|---|
| `claude` | `~/.claude/settings.json` | `~/.claude/skills/aimemory/SKILL.md` |
| `codex` | `~/.codex/hooks.json` | `~/.codex/skills/aimemory/SKILL.md` |
| `kiro` | `~/.kiro/agents/default.json` | `~/.kiro/skills/aimemory/SKILL.md` |
| `antigravity` | `~/.gemini/config/hooks.json` | `~/.gemini/config/skills/aimemory/SKILL.md` |

## akbun-taskq integration

In `taskq.config.json`, enable `bots.aimemory` so taskq bots get `aimemory_search` and `aimemory_add` tools backed by `aimem`:

```json
{
  "bots": {
    "aimemory": {
      "enabled": true,
      "command": "aimem"
    }
  }
}
```
