import type { IndexerConfig } from '../config.ts'

export type ModelCaller = (prompt: string, config: IndexerConfig) => Promise<string>

const SYSTEM_PROMPT = [
  'You are a memory indexer for a coding agent.',
  'Given raw observations from one session and existing memories for the same project, produce:',
  '1) a concise factual summary of what happened and what was decided,',
  '2) memory reconciliation actions comparing new durable facts against existing memories:',
  '   - ADD: a durable new fact not already covered,',
  '   - UPDATE: a durable fact that supersedes an existing memory (provide target_id from the existing list),',
  '   - NOOP: when existing memory already covers the fact.',
  'Reply with ONLY a JSON object matching: {"summary":"...","actions":[{"op":"ADD","content":"..."},{"op":"UPDATE","target_id":123,"content":"..."},{"op":"NOOP"}]}',
].join('\n')

const EFFORT_BUDGET: Record<IndexerConfig['effort'], number> = {
  low: 1024,
  medium: 2048,
  high: 4096,
}

function apiEndpoint(baseUrl: string, path: string): string {
  const clean = baseUrl.replace(/\/+$/, '')
  return clean.endsWith('/v1') ? `${clean}${path}` : `${clean}/v1${path}`
}

export async function callClaude(prompt: string, config: IndexerConfig): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  const url = apiEndpoint(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com', '/messages')
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: EFFORT_BUDGET[config.effort] ?? 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`claude indexer HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { content?: { type?: string; text?: string }[] }
  const text = (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join('\n').trim()
  if (!text) throw new Error('claude indexer returned empty response')
  return text
}

export async function callOpenAI(prompt: string, config: IndexerConfig): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  const url = apiEndpoint(process.env.OPENAI_BASE_URL || 'https://api.openai.com', '/chat/completions')
  const body: Record<string, unknown> = {
    model: config.model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  }
  if (/^(o[1-9]|gpt-5)/i.test(config.model)) body.reasoning_effort = config.effort
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`openai indexer HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('openai indexer returned empty response')
  return text
}

export const defaultModelCaller: ModelCaller = async (prompt, config) => {
  if (config.provider === 'claude') return callClaude(prompt, config)
  if (config.provider === 'openai') return callOpenAI(prompt, config)
  throw new Error(`indexer provider "${config.provider}" does not accept model calls`)
}
