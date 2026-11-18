import type { Db } from './open.ts'
import { getAgent } from './team.ts'
import type { TurnResult } from '../team/types.ts'

// Token and cost accounting for the Usage page, and the context size each bot ends its last turn with.

export function recordUsage(db: Db, turnId: number, bot: string, result: TurnResult): void {
  const agent = getAgent(db, bot)
  const u = result.usage
  // sdk and provider were set when the turn started; this fills them only for a turn row from before that.
  db.prepare(`UPDATE team_turns SET provider = CASE WHEN sdk IS NULL THEN ? ELSE provider END, sdk = coalesce(sdk, ?), model = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?,
    cache_write_tokens = ?, credits = ? WHERE id = ?`).run(agent?.sdk === 'openai' ? agent.provider ?? 'api' : null, agent?.sdk ?? null,
    result.model ?? agent?.model ?? null, u?.input_tokens ?? null, u?.output_tokens ?? null, u?.cache_read_tokens ?? null,
    u?.cache_write_tokens ?? null, u?.credits ?? null, turnId)
  if (result.context) {
    db.prepare('UPDATE team_agents SET context_tokens = ?, context_window = COALESCE(?, context_window) WHERE name = ?')
      .run(result.context.tokens, result.context.window, bot)
  }
}

export type Period = 'today' | '7d' | '30d' | 'all'
export const PERIODS: Period[] = ['today', '7d', '30d', 'all']

function since(period: Period, now = new Date()): number {
  if (period === 'all') return 0
  if (period === 'today') return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
  return Math.floor(now.getTime() / 1000) - (period === '7d' ? 7 : 30) * 86_400
}

export interface UsageRow {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_usd: number
  turns: number
}

const SUMS = `count(*) AS turns, coalesce(sum(input_tokens), 0) AS input_tokens, coalesce(sum(output_tokens), 0) AS output_tokens,
  coalesce(sum(cache_read_tokens), 0) AS cache_read_tokens, coalesce(sum(cache_write_tokens), 0) AS cache_write_tokens,
  coalesce(sum(cost_usd), 0) AS cost_usd, sum(credits) AS credits`

// Per SDK (and OpenAI provider), per bot session, and the one-off task runs (Claude) over a period.
export function usageReport(db: Db, period: Period) {
  const from = since(period)
  const bySdk = db.prepare(`SELECT coalesce(sdk, 'claude') AS sdk, provider, ${SUMS} FROM team_turns
    WHERE started_at >= ? AND ended_at IS NOT NULL GROUP BY coalesce(sdk, 'claude'), provider ORDER BY cost_usd DESC`).all(from)
  const bySession = db.prepare(`SELECT t.agent AS bot, coalesce(t.sdk, 'claude') AS sdk, t.provider, t.session_id,
      max(t.model) AS model, min(t.started_at) AS first_at, max(t.started_at) AS last_at, ${SUMS.replaceAll('sum(', 'sum(t.').replace('count(*)', 'count(*)')}
    FROM team_turns t WHERE t.started_at >= ? AND t.ended_at IS NOT NULL
    GROUP BY t.agent, coalesce(t.sdk, 'claude'), t.provider, t.session_id ORDER BY last_at DESC LIMIT 200`).all(from)
  const runs = db.prepare(`SELECT count(*) AS runs, coalesce(sum(json_extract(stats, '$.cost_usd')), 0) AS cost_usd,
      coalesce(sum(json_extract(stats, '$.input_tokens')), 0) AS input_tokens, coalesce(sum(json_extract(stats, '$.output_tokens')), 0) AS output_tokens
    FROM runs WHERE started_at >= ? AND ended_at IS NOT NULL AND bot IS NULL`).get(from)
  return { period, since: from, by_sdk: bySdk, by_session: bySession, task_runs: runs }
}
