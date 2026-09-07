import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, worker } from './helpers.js';

const input = { url: 'https://example.com/import', title: 'Imported', tags: ['태그'], location: 'archive', saved_at: '2020-01-02T03:04:05Z', body: '보관 본문', format: 'markdown' };

test('import preserves metadata without AI/extraction and retries without new writes', async () => {
  const f = await fixture();
  const response = await f.request('/import', 'POST', input);
  assert.equal(response.status, 201);
  const { document } = await response.json();
  assert.equal(document.created_at, '2020-01-02T03:04:05.000Z');
  assert.equal(document.ai_status, 'skipped');
  assert.equal(document.location, 'archive');
  assert.equal((await (await f.request('/import', 'POST', input)).json()).status, 'existing');
  const page = await (await f.request('/changes?after=0')).json();
  assert.equal(page.changes.length, 1);
  assert.equal(page.changes[0].body, input.body);
  assert.equal((await (await f.request(`/changes?after=${page.next}`)).json()).changes.length, 0);
  await f.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(document.id).run();
  const deletion = await (await f.request(`/changes?after=${page.next}`)).json();
  assert.equal(deletion.changes[0].id, null);
  assert.equal(deletion.changes[0].document_id, document.id);
});

test('import rejects bad metadata and enforces the daily cap before insertion', async () => {
  const f = await fixture();
  for (const patch of [{saved_at:'yesterday'}, {location:'unknown'}, {url:'file:///etc/passwd'}, {format:'pdf'}]) {
    assert.equal((await f.request('/import', 'POST', {...input,...patch})).status, 400);
  }
  await f.env.DB.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x < 3000)
    INSERT INTO documents(id, normalized_url, title, import_day) SELECT 'seed-'||x, 'https://seed.test/'||x, 'seed', date('now') FROM n`).run();
  assert.equal((await f.request('/import', 'POST', input)).status, 429);
});

test('automation alias requires tokens and cannot mint credentials', async () => {
  const f = await fixture();
  const call = (path, headers = {}) => worker.default.fetch(new Request(`https://reader.test/automation/${path}`, { headers }), f.env, f.ctx);
  assert.equal((await call('me')).status, 401);
  assert.equal((await call('me', {authorization:`Bearer ${f.token}`})).status, 200);
  assert.equal((await call('tokens', {authorization:`Bearer ${f.token}`})).status, 403);
});
