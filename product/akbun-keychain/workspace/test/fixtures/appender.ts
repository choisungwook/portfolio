// Child process for the rotation test: appends <count> lines whose exit_code is <tag>*1000+n, with a small size limit.
import { appendAudit } from '../../src/core/audit.ts'

const [tag, count] = process.argv.slice(2).map(Number)
for (let index = 0; index < count; index++) {
  await appendAudit({ actor: 'cli', op: 'reveal', keys: ['k'], ok: true, exit_code: tag * 1000 + index }, { maxBytes: 8000 })
}
