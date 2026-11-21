import type { Settings } from '@anthropic-ai/claude-agent-sdk'

// Every Claude session taskq starts compacts its own conversation when the context fills. Without it a long bot
// session or task run ends with "prompt is too long" and no turn can run until the session is reset. Passed as flag
// settings, it outranks a user setting that turned auto-compact off (a task worker loads the user's settings). When to
// compact is left to Claude Code, which tunes the window per model; taskq's own handover (src/team/hub.ts) still
// starts a new session at its lower limit, and this is the net for a turn that grows past the window before then.
export const COMPACTION_SETTINGS: Settings = { autoCompactEnabled: true }
