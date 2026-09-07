import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = mkdtempSync(join(tmpdir(), 'snspublisher-tests-'));
await build({
  stdin: { contents: "export { default } from './worker/index.ts';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'neutral', outfile: join(directory, 'worker.mjs'),
});
const worker = (await import(pathToFileURL(join(directory, 'worker.mjs')).href)).default;
const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  DB: { prepare() { throw new Error('DB must not be touched without a well-formed token'); } },
};
const fetch = (path, headers = {}) => worker.fetch(new Request(`https://publisher.test${path}`, { headers }), env);

test('static paths fall through to the assets binding', async () => {
  assert.equal(await (await fetch('/')).text(), 'asset');
});

test('health needs no login', async () => {
  const response = await fetch('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('every other API path is rejected without Access or a token', async () => {
  assert.equal((await fetch('/api/me')).status, 401);
  assert.equal((await fetch('/api/me', { authorization: 'Bearer not-a-token' })).status, 401);
});
