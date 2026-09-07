import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { fixture, worker } from './helpers.js';

async function clientFixture() {
  const f = await fixture();
  const client = new Client({ name: 'integration', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL('https://reader.test/mcp'), {
    requestInit: { headers: { authorization: `Bearer ${f.token}` } },
    fetch: (url, init) => worker.default.fetch(new Request(url, init), f.env, f.ctx),
  });
  await client.connect(transport);
  return { ...f, client };
}

test('SDK client discovers and calls all five tools with optimistic tag writes', async () => {
  const f = await clientFixture();
  try {
    assert.deepEqual((await f.client.listTools()).tools.map(t => t.name).sort(), ['add_tags', 'get_document', 'list_tags', 'save_url', 'search_documents']);
    const saved = await f.request('/documents', 'POST', { url: 'https://example.com/article', body: '본문 검색 테스트', tags: ['기존'] });
    const document = await saved.json();
    await f.settle();
    const read = async (name, args) => JSON.parse((await f.client.callTool({ name, arguments: args })).content[0].text);
    assert.equal((await read('search_documents', { query: '본문' })).documents[0].id, document.id);
    const current = await read('get_document', { id: document.id });
    const changed = await read('add_tags', { id: document.id, version: current.version, tags: ['추가'] });
    assert.deepEqual(changed.tags, ['기존', '추가']);
    assert.equal((await f.client.callTool({ name: 'add_tags', arguments: { id: document.id, version: current.version, tags: ['충돌'] } })).isError, true);
    assert.equal((await read('list_tags', {})).tags.length, 2);
    assert.equal((await read('save_url', { url: 'https://example.com/article' })).id, document.id);
    assert.equal((await f.client.callTool({ name: 'get_document', arguments: { id: '../tokens' } })).isError, true);
  } finally { await f.client.close(); }
});

test('MCP rejects missing/revoked tokens, cross-origin and unsupported HTTP methods', async () => {
  const f = await fixture();
  const call = (headers = {}, method = 'POST') => worker.default.fetch(new Request('https://reader.test/mcp', {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: '{}' } : {}),
  }), f.env, f.ctx);
  assert.equal((await call()).status, 401);
  const headers = { authorization: `Bearer ${f.token}` };
  assert.equal((await call({ ...headers, origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(headers, 'GET')).status, 405);
  await f.env.DB.prepare("UPDATE api_tokens SET revoked_at = 'now'").run();
  assert.equal((await call(headers)).status, 401);
});
