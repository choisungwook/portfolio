import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, worker } from './helpers.js';

const article = { url: 'https://example.com/article?utm_source=test', title: '테스트 글', body: '<script>attack()</script> 본문', tags: ['기술'] };

test('API denies missing/forged authentication, cross-origin writes and revoked tokens', async () => {
  const f = await fixture();
  for (const path of ['/documents', '/tags', '/tokens', '/ai', '/me']) {
    assert.equal((await f.request(path, 'GET', undefined, { authorization: '' })).status, 401);
    assert.equal((await f.request(path, 'GET', undefined, { authorization: '', 'Cf-Access-Jwt-Assertion': 'forged' })).status, 401);
  }
  assert.equal((await f.request('/documents', 'POST', article, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await f.request('/tokens')).status, 403);
  assert.equal((await f.request('/tokens', 'POST', { name: 'phone' })).status, 403);
  assert.equal((await f.request('/tokens/test', 'DELETE')).status, 403);
  await f.env.DB.prepare("UPDATE api_tokens SET revoked_at = '2026-09-07' WHERE id = 'test'").run();
  assert.equal((await f.request('/me')).status, 401);
});

test('save deduplicates normalized URLs, filters tags and rejects stale edits', async () => {
  const f = await fixture();
  const first = await f.request('/documents', 'POST', article);
  assert.equal(first.status, 201);
  const saved = await first.json();
  await f.settle();
  const duplicate = await f.request('/documents', 'POST', { ...article, url: 'https://example.com/article' });
  assert.equal(duplicate.status, 200);
  const current = await duplicate.json();
  assert.equal(current.id, saved.id);
  assert.equal(current.ai_status, 'skipped');
  assert.equal((await (await f.request('/documents?tag=기술')).json()).documents.length, 1);
  assert.equal((await (await f.request('/documents?tag=없음')).json()).documents.length, 0);
  const changed = await f.request(`/documents/${saved.id}`, 'PATCH', { version: current.version, location: 'archive', is_read: true, tags: ['책'] });
  assert.equal(changed.status, 200);
  assert.equal((await f.request(`/documents/${saved.id}`, 'PATCH', { version: current.version, tags: [] })).status, 409);
  const archived = await (await f.request('/documents?location=archive')).json();
  assert.equal(archived.documents[0].is_read, 1);
  assert.equal(archived.documents[0].body, undefined);
  const changes = await f.env.DB.prepare('SELECT * FROM changes ORDER BY seq').all();
  assert.equal(changes.results.length, 3);
  assert.deepEqual(changes.results.map(row => row.operation), ['create', 'update', 'update']);
});

test('invalid URL, oversized body, location, tags and JSON are rejected', async () => {
  const f = await fixture();
  for (const payload of [{ url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' }, { ...article, tags: 'tag' }, { ...article, body: 'x'.repeat(140_000) }]) {
    assert.ok([400, 413].includes((await f.request('/documents', 'POST', payload)).status));
  }
  assert.equal((await f.request('/documents?location=bad')).status, 400);
  assert.equal((await f.request('/documents?offset=-1')).status, 400);
  assert.equal((await f.request('/documents', 'POST', null)).status, 400);
});

function enableAI(f) {
  Object.assign(f.env, { AI_API_KEY: 'test', AI_BASE_URL: 'https://model.test/v1', AI_MODEL: 'test', AI_MONTHLY_CALL_LIMIT: '2', AI_MONTHLY_BUDGET_WON: '10', AI_MAX_CALL_WON: '6' });
}
async function pendingDocument(f, id) {
  await f.env.DB.prepare('INSERT INTO documents(id, normalized_url, title, body, tags_json) VALUES (?, ?, ?, ?, ?)')
    .bind(id, `https://example.com/${id}`, id, '테스트 본문', '["기술","책"]' ).run();
}

test('AI budget reservation blocks overspending and requires explicit tag approval', async () => {
  const f = await fixture(); enableAI(f);
  await pendingDocument(f, 'first'); await pendingDocument(f, 'second');
  let calls = 0;
  const provider = { async summarize() { calls++; return { summary: ['하나', '둘', '셋'], tags: ['기술', '새로운 태그'] }; } };
  await worker.enrichDocument('first', f.env, provider);
  await worker.enrichDocument('second', f.env, provider);
  assert.equal(calls, 1);
  const first = await (await f.request('/documents/first')).json();
  assert.deepEqual(first.summary, ['하나', '둘', '셋']);
  assert.deepEqual(first.suggested_tags, ['기술']);
  assert.equal((await (await f.request('/documents/second')).json()).ai_status, 'limited');
  assert.equal((await f.request('/documents/first', 'PATCH', { version: first.version, approve_tags: ['unknown'] })).status, 400);
  const approved = await (await f.request('/documents/first', 'PATCH', { version: first.version, approve_tags: ['기술'] })).json();
  assert.deepEqual(approved.suggested_tags, []);
  assert.deepEqual(approved.tags, ['기술', '책']);
  const usage = await (await f.request('/ai')).json();
  assert.equal(usage.usage.reserved_won, 6);
});

test('AI failure keeps document and charged reservation, invalid limits disable requests', async () => {
  const f = await fixture(); enableAI(f);
  await pendingDocument(f, 'first');
  await worker.enrichDocument('first', f.env, { async summarize() { throw new Error('timeout'); } });
  const document = await (await f.request('/documents/first')).json();
  assert.equal(document.ai_status, 'failed'); assert.equal(document.body, '테스트 본문');
  assert.equal((await (await f.request('/ai')).json()).usage.calls, 1);
  f.env.AI_MONTHLY_BUDGET_WON = '1001'; assert.equal(worker.aiLimits(f.env), null);
  f.env.AI_MONTHLY_BUDGET_WON = '10'; f.env.AI_MAX_CALL_WON = '0'; assert.equal(worker.aiLimits(f.env), null);
  assert.throws(() => worker.parseSuggestion({ summary: ['one'], tags: [] }, []));
});

test('AI provider uses bounded input/output and validates compatible JSON response', async () => {
  const f = await fixture(); enableAI(f);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'https://model.test/v1/chat/completions');
    assert.equal(options.redirect, 'manual');
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 512);
    assert.equal(JSON.parse(body.messages[1].content).body.length, 12000);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: ['1', '2', '3'], tags: ['기술', 'unknown'] }) } }] });
  };
  try {
    const result = await new worker.CompatibleProvider(f.env).summarize('가'.repeat(14000), ['기술']);
    assert.deepEqual(result.tags, ['기술']);
  } finally { globalThis.fetch = originalFetch; }
});

test('Access validates signature, issuer, audience, owner, expiry and browser origin', async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  const f = await fixture();
  Object.assign(f.env, { ACCESS_TEAM_DOMAIN: 'reader-test.cloudflareaccess.com', ACCESS_AUD: 'reader', ACCESS_OWNER_SUB: 'owner' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [key] });
  async function jwt(sub = 'owner', aud = 'reader', expiration = '1h') {
    return new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(sub)
      .setIssuer('https://reader-test.cloudflareaccess.com').setAudience(aud).setExpirationTime(expiration).sign(privateKey);
  }
  try {
    const valid = { authorization: '', 'Cf-Access-Jwt-Assertion': await jwt() };
    assert.equal((await f.request('/me', 'GET', undefined, valid)).status, 200);
    assert.equal((await f.request('/tokens', 'POST', { name: 'browser' }, valid)).status, 403);
    const browser = { ...valid, origin: 'https://reader.test' };
    const response = await f.request('/tokens', 'POST', { name: 'browser' }, browser);
    assert.equal(response.status, 201);
    const issued = await response.json();
    const stored = await f.env.DB.prepare('SELECT token_hash FROM api_tokens WHERE id = ?').bind(issued.id).first();
    assert.notEqual(stored.token_hash, issued.token);
    assert.equal((await f.request('/me', 'GET', undefined, { authorization: `Bearer ${issued.token}` })).status, 200);
    const listed = await (await f.request('/tokens', 'GET', undefined, browser)).json();
    assert.equal(JSON.stringify(listed).includes(issued.token), false);
    assert.equal((await f.request(`/tokens/${issued.id}`, 'DELETE', undefined, browser)).status, 200);
    assert.equal((await f.request('/me', 'GET', undefined, { authorization: `Bearer ${issued.token}` })).status, 401);
    for (const token of [await jwt('guest'), await jwt('owner', 'other'), await jwt('owner', 'reader', '-1h')]) {
      assert.equal((await f.request('/me', 'GET', undefined, { authorization: '', 'Cf-Access-Jwt-Assertion': token })).status, 401);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('AI call limit also stops requests when the cost budget has room', async () => {
  const f = await fixture(); enableAI(f); f.env.AI_MONTHLY_CALL_LIMIT = '1'; f.env.AI_MAX_CALL_WON = '1';
  await pendingDocument(f, 'first'); await pendingDocument(f, 'second');
  let calls = 0;
  const provider = { async summarize() { calls++; return { summary: ['1', '2', '3'], tags: [] }; } };
  await worker.enrichDocument('first', f.env, provider); await worker.enrichDocument('second', f.env, provider);
  assert.equal(calls, 1);
  assert.equal((await (await f.request('/documents/second')).json()).ai_status, 'limited');
});
