import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('MCP initializes and lists tools inside workerd without Node compatibility', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reader-mcp-runtime-'));
  const bundle = await build({ stdin: { contents: "import { mcp } from './worker/mcp.ts'; export default {fetch: (r,e,c) => mcp(r,e,c)}", resolveDir: process.cwd() }, bundle: true, platform: 'neutral', mainFields: ['module', 'main'], format: 'esm', write: false });
  const runtime = new Miniflare(convertV4MiniflareOptions({ name: 'reader-mcp-test', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-09-01', cf: false, unsafeDevRegistryPath: directory }));
  try {
    for (const [method, params] of [['initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }], ['tools/list', {}]]) {
      const response = await runtime.dispatchFetch('https://local.test/mcp', { method: 'POST', headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      assert.equal(response.status, 200, await response.clone().text());
      assert.ok((await response.json()).result);
    }
  } finally { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); }
});
