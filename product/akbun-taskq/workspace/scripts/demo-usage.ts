import type { Db } from '../src/db/open.ts'

// Demo bots on every SDK, with finished turns that carry tokens and cost, and context sizes for the context rings.
export function seedUsage(db: Db, now: number): void {
  db.prepare(`UPDATE team_agents SET sdk = 'openai', provider = 'chatgpt', permission_mode = 'acceptEdits' WHERE name = 'reviewer'`).run()
  db.prepare(`UPDATE team_agents SET sdk = 'kiro', permission_mode = 'plan' WHERE name = 'doc-reviewer'`).run()
  const context = db.prepare('UPDATE team_agents SET context_tokens = ?, context_window = ? WHERE name = ?')
  context.run(48_000, 200_000, 'taskq')
  context.run(151_000, 200_000, 'planner')
  context.run(90_000, 200_000, 'coder')
  context.run(190_000, 272_000, 'reviewer')
  context.run(300, 1000, 'doc-reviewer')
  const turn = db.prepare(`INSERT INTO team_turns (agent, session_id, started_at, ended_at, outcome, turns, cost_usd, sdk, provider, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, credits) VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const rows: [string, string, number, number, string, string | null, string, number, number, number, number, number | null][] = [
    ['taskq', 'sess-taskq', 3, 0.42, 'claude', null, 'claude-opus-5-5', 18_000, 4_200, 220_000, 9_000, null],
    ['planner', 'sess-planner', 5, 0.31, 'claude', null, 'claude-sonnet-5-5', 22_000, 6_100, 310_000, 12_000, null],
    ['coder', 'sess-coder', 9, 1.12, 'claude', null, 'claude-sonnet-5-5', 64_000, 21_000, 880_000, 40_000, null],
    ['reviewer', 'th-91c2', 4, 0, 'openai', 'chatgpt', 'gpt-5-codex', 120_000, 8_000, 95_000, 0, null],
    ['doc-reviewer', 'kiro:latest', 2, 0, 'kiro', null, 'auto', 9_000, 2_000, 0, 0, 1.6],
  ]
  rows.forEach(([agent, session, turns, cost, sdk, provider, model, input, output, cacheRead, cacheWrite, credits], i) => {
    const at = now - 3600 * (i + 1)
    turn.run(agent, session, at, at + 120, turns, cost, sdk, provider, model, input, output, cacheRead, cacheWrite, credits)
  })
}
