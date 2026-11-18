import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { getPage, listPages, writePage } from '../src/db/wiki.ts'
import { createJobRunner, type JobContext } from '../src/jobs/runner.ts'
import { JOB_HANDLERS } from '../src/jobs/handlers.ts'
import { createJob, getJob, saveProgress } from '../src/jobs/store.ts'
import { hybridSearch } from '../src/team/search.ts'
import { readZip, writeZip } from '../src/util/zip.ts'
import { importWikiJob } from '../src/wiki/transfer.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

function hasUnzip(): boolean {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('wiki export and import', () => {
  let env: TestEnv
  test.beforeEach(() => { env = setup() })
  test.afterEach(() => env.cleanup())

  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })
  const runJobs = async () => {
    const runner = createJobRunner(env.db, env.config, JOB_HANDLERS, 20)
    runner.start()
    await runner.idle()
    await runner.stop()
  }

  test('a zip written at level 9 reads back, and standard unzip accepts it', () => {
    const entries = [{ name: 'a/한글.md', data: Buffer.from('# 제목\n\n'.repeat(2000)) }, { name: 'empty.txt', data: Buffer.alloc(0) }]
    const zip = writeZip(entries)
    assert.ok(zip.length < entries[0].data.length / 10, 'repetitive text compresses well')
    assert.deepEqual(readZip(zip).map((e) => [e.name, e.data.toString()]), entries.map((e) => [e.name, e.data.toString()]))
    if (hasUnzip()) {
      const file = join(env.home, 't.zip')
      writeFileSync(file, zip)
      assert.match(execFileSync('unzip', ['-t', file], { encoding: 'utf8' }), /No errors detected/)
    }
    assert.throws(() => readZip(zip, { maxEntries: 5000, maxTotalBytes: 10 }), /unpacks to more than/)
  })

  test('[critical] an export restores every page into an empty wiki', async () => {
    writePage(env.db, { slug: 'notes/search', title: '검색', body: '검색률을 올리는 방법 [[notes/budget]]', author: 'planner', base_revision: 0 })
    writePage(env.db, { slug: 'notes/budget', title: 'Budget', body: 'Daily budget is $10', author: 'taskq', base_revision: 0 })
    const job = await (await call('POST', '/bots/wiki/export')).json() as { id: string; status: string }
    assert.equal(job.status, 'queued')
    await runJobs()
    const done = await (await call('GET', `/jobs/${job.id}`)).json() as { status: string; result: { path: string; pages: number } }
    assert.equal(done.status, 'done')
    assert.equal(done.result.pages, 2)
    const zipPath = join(env.home, 'shared', done.result.path)
    assert.ok(existsSync(zipPath))
    const names = readZip(readFileSync(zipPath)).map((e) => e.name).sort()
    assert.deepEqual(names, ['manifest.json', 'wiki/notes/budget.md', 'wiki/notes/search.md'])

    const other = setup()
    try {
      const target = join(other.home, 'shared', 'in.zip')
      mkdirSync(join(other.home, 'shared'), { recursive: true })
      writeFileSync(target, readFileSync(zipPath))
      const job2 = createJob(other.db, 'wiki_import', { source: 'in.zip' })
      const runner = createJobRunner(other.db, other.config, JOB_HANDLERS, 20)
      runner.start()
      await runner.idle()
      await runner.stop()
      assert.equal(getJob(other.db, job2.id)?.status, 'done')
      assert.equal(getPage(other.db, 'notes/search')?.body, '검색률을 올리는 방법 [[notes/budget]]')
      assert.equal(getPage(other.db, 'notes/budget')?.title, 'Budget')
    } finally {
      other.cleanup()
    }
  })

  test('[critical] imported documents become pages bots can search: split by section, links kept, binaries skipped', async () => {
    const docs = join(env.home, 'docs')
    mkdirSync(join(docs, 'guide'), { recursive: true })
    const long = ['# 운영 가이드', '', '이 문서는 배포 절차를 설명한다.', '', ...Array.from({ length: 4 }, (_, i) => `## 단계 ${i + 1}\n\n${'롤백 절차를 확인한다. '.repeat(250)}`)].join('\n')
    writeFileSync(join(docs, 'guide', 'ops.md'), long)
    writeFileSync(join(docs, 'readme.md'), '# Readme\n\nSee [the ops guide](guide/ops.md) and [web](https://example.com).')
    writeFileSync(join(docs, 'page.html'), '<html><body><h1>Pricing</h1><p>Plan &amp; cost</p><script>x()</script></body></html>')
    writeFileSync(join(docs, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))
    const res = await call('POST', '/bots/wiki/import', { source: docs, name: 'team docs' })
    assert.equal(res.status, 202)
    const { id } = await res.json() as { id: string }
    await runJobs()
    const job = getJob(env.db, id)!
    assert.equal(job.status, 'done', job.error ?? '')
    assert.equal(job.result?.skipped, 1)
    assert.equal(job.result?.index, 'import/team-docs/index')
    const slugs = listPages(env.db).map((p) => p.slug)
    assert.ok(slugs.includes('import/team-docs/guide-ops'))
    assert.ok(slugs.filter((s) => s.startsWith('import/team-docs/guide-ops-s')).length === 4, 'one page per ## section')
    assert.match(getPage(env.db, 'import/team-docs/readme')!.body, /\[\[import\/team-docs\/guide-ops\]\]/, 'a relative link becomes a wiki link')
    assert.match(getPage(env.db, 'import/team-docs/readme')!.body, /\(https:\/\/example\.com\)/, 'external links stay')
    assert.doesNotMatch(getPage(env.db, 'import/team-docs/page')!.body, /<p>|x\(\)/)
    assert.match(getPage(env.db, 'import/team-docs/index')!.body, /logo\.png/)
    assert.ok(hybridSearch(env.db)('롤백 절차').some((hit) => hit.slug.startsWith('import/team-docs/guide-ops')))
  })

  test('[critical] a cancelled import resumes from its checkpoint without writing pages twice', async () => {
    const docs = join(env.home, 'many')
    mkdirSync(docs)
    for (let i = 0; i < 6; i += 1) writeFileSync(join(docs, `n${i}.md`), `# Note ${i}\n\nbody ${i}`)
    const job = createJob(env.db, 'wiki_import', { source: docs, name: 'many' })
    const ctx = (stopAt: number): JobContext => ({
      db: env.db, config: env.config, job: getJob(env.db, job.id)!,
      step(progress) {
        saveProgress(env.db, job.id, progress)
        return progress.done < stopAt
      },
    })
    assert.equal(await importWikiJob(ctx(3)), 'cancelled')
    assert.equal(getJob(env.db, job.id)?.done, 3)
    assert.equal(listPages(env.db).length, 3)
    const result = await importWikiJob(ctx(Infinity)) as { pages: number }
    assert.equal(result.pages, 6)
    assert.ok(listPages(env.db).filter((p) => p.slug !== 'import/many/index').every((p) => p.revision === 1), 'no page written twice')

    const api = await (await call('POST', `/jobs/${job.id}/resume`)).json() as { error?: string }
    assert.match(api.error ?? '', /cancelled or failed/, 'a job still marked queued is not resumed twice')
    assert.equal((await call('POST', '/bots/wiki/import', { source: '/no/such/folder' })).status, 400)
  })
})
