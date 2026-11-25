// VisionLlm on the Claude API with the user's API key. Images go inline as base64; the answer is plain text that
// core/omr.ts parses as JSON, so the same prompt works for both providers.

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Availability, TaskContext, VisionLlm, VisionRequest, VisionResult } from '../../core/ports.ts'

// USD per million tokens, for the usage display only.
const PRICE: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

const MEDIA = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' } as const

export function createClaudeVision(apiKey: string | null, modelId: string): VisionLlm {
  return {
    id: 'claude-api',
    modelId,
    async available(): Promise<Availability> {
      return apiKey ? { ok: true } : { ok: false, reason: 'no-api-key', hint: 'Add a Claude API key in Settings.' }
    },
    async complete(req: VisionRequest, ctx: TaskContext): Promise<VisionResult> {
      if (!apiKey) throw new Error('No Claude API key. Add one in Settings.')
      const client = new Anthropic({ apiKey })
      const images = await Promise.all(
        req.images.map(async (file) => {
          const mediaType = MEDIA[path.extname(file).toLowerCase() as keyof typeof MEDIA]
          if (!mediaType) throw new Error(`unsupported image type: ${file}`)
          const data = (await fs.readFile(file)).toString('base64')
          return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data } }
        }),
      )
      const stream = client.messages.stream(
        {
          model: modelId,
          max_tokens: 64000,
          output_config: { effort: 'high' },
          system: req.system,
          messages: [{ role: 'user', content: [...images, { type: 'text', text: req.prompt }] }],
        },
        { signal: ctx.signal },
      )
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') throw new Error('Claude declined to read this image')
      const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      const price = PRICE[modelId]
      const { input_tokens: inputTokens, output_tokens: outputTokens } = message.usage
      return {
        text,
        usage: { inputTokens, outputTokens, ...(price ? { costUsd: (inputTokens * price[0] + outputTokens * price[1]) / 1e6 } : {}) },
      }
    },
  }
}
