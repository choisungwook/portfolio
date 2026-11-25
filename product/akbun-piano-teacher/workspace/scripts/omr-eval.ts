// P0 OMR measurement without the app UI. Runs one VisionLlm over page images and scores the result against an answer.
//
//   node scripts/omr-eval.ts --engine codex|claude --truth answer.musicxml --out results/ page1.png page2.png
//
// Claude reads ANTHROPIC_API_KEY. --model overrides the model id. Answers for copyrighted pieces stay in
// test-data/private/ (gitignored). Prints and writes a JSON line with the metrics, time and usage.

import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parseArgs } from 'node:util'
import { recognizePages } from '../src/core/omr.ts'
import { compareScores } from '../src/core/omr-metrics.ts'
import { parseMusicXmlText } from '../src/main/library.ts'
import { createClaudeVision } from '../src/main/vision/claude-api.ts'
import { createCodexVision } from '../src/main/vision/codex.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { engine: { type: 'string', default: 'codex' }, truth: { type: 'string' }, model: { type: 'string' }, out: { type: 'string', default: 'omr-eval-out' } },
})
if (!values.truth || positionals.length === 0) {
  console.error('usage: node scripts/omr-eval.ts --engine codex|claude --truth answer.musicxml [--model id] [--out dir] page.png ...')
  process.exit(2)
}

const llm = values.engine === 'claude'
  ? createClaudeVision(process.env.ANTHROPIC_API_KEY ?? null, values.model ?? 'claude-opus-5-5')
  : createCodexVision(process.env.CODEX_PATH ?? 'codex', values.model ?? '')
const availability = await llm.available()
if (!availability.ok) {
  console.error(availability.hint)
  process.exit(1)
}

await fs.mkdir(values.out!, { recursive: true })
const cacheDir = path.join(values.out!, 'cache')
await fs.mkdir(cacheDir, { recursive: true })
const cacheFile = (key: string) => path.join(cacheDir, `${createHash('sha256').update(key).digest('hex')}.txt`)
const cache = { get: (key: string) => fs.readFile(cacheFile(key), 'utf8').catch(() => undefined), set: (key: string, text: string) => fs.writeFile(cacheFile(key), text) }
const ctx = {
  signal: new AbortController().signal,
  progress: (p: { message?: string }) => p.message && console.error(p.message),
  log: (level: string, message: string) => console.error(`[${level}] ${message}`),
}

const pages = await Promise.all(positionals.map(async (file) => ({ path: path.resolve(file), hash: createHash('sha256').update(await fs.readFile(file)).digest('hex') })))
const started = Date.now()
const result = await recognizePages(pages, llm, cache, ctx, path.basename(values.truth))
const seconds = (Date.now() - started) / 1000
const truth = parseMusicXmlText(await fs.readFile(values.truth, 'utf8'), 'truth')
const line = {
  engine: llm.id,
  model: llm.modelId,
  pages: pages.length,
  seconds,
  ...compareScores(result.score, truth),
  invalidMeasures: result.origins.filter((o) => o.status === 'invalid').length,
  usage: result.usage,
}
console.log(JSON.stringify(line))
await fs.appendFile(path.join(values.out!, 'results.jsonl'), `${JSON.stringify(line)}\n`)
await fs.writeFile(path.join(values.out!, `${llm.id}-origins.json`), JSON.stringify(result.origins, null, 2))
