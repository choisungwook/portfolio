import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('workerd executes real outbound fetch for extraction and compatible AI without redirects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reader-runtime-test-'));
  const result = await build({
    stdin: { contents: `import { fetchHtml } from './worker/extraction/fetch.ts';
      import { extractHtml } from './worker/extraction/html.ts';
      import { CompatibleProvider } from './worker/ai.ts';
      export default { async fetch() {
        const document = extractHtml(await fetchHtml('https://example.com/article'));
        const provider = new CompatibleProvider({AI_BASE_URL:'https://model.test/v1',AI_API_KEY:'fixture',AI_MODEL:'fixture'});
        return Response.json({document, suggestion: await provider.summarize(document.body, ['reading'])});
      } };`, resolveDir: process.cwd() },
    bundle: true, platform: 'neutral', mainFields: ['module', 'main'], format: 'esm', write: false,
  });
  const visited = [];
  const runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'reader-extraction-test', modules: true, script: result.outputFiles[0].text,
    compatibilityDate: '2026-09-01', cf: false, unsafeDevRegistryPath: directory,
    outboundService(request) {
      const url = new URL(request.url); visited.push(url.hostname);
      if (url.hostname === 'cloudflare-dns.com') return Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.215.14' }] });
      if (url.hostname === 'example.com') {
        assert.equal(request.headers.get('authorization'), null);
        return new Response('<title>Runtime article</title><article><p>' + 'A long enough reading article. '.repeat(5) + '</p></article>', { headers: { 'content-type': 'text/html' } });
      }
      if (url.hostname === 'model.test') return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: ['one', 'two', 'three'], tags: ['reading'] }) } }] });
      throw new Error('Unexpected network destination');
    },
  }));
  try {
    const response = await runtime.dispatchFetch('https://local.test');
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    assert.equal(data.document.title, 'Runtime article');
    assert.deepEqual(data.suggestion.tags, ['reading']);
    assert.deepEqual(visited.sort(), ['cloudflare-dns.com', 'cloudflare-dns.com', 'example.com', 'model.test']);
  } finally { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); }
});
