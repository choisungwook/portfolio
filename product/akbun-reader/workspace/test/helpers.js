import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = mkdtempSync(join(tmpdir(), 'reader-tests-'));
await build({
  stdin: { contents: "export { default } from './worker/index.ts'; export * from './worker/ai.ts'; export * from './worker/auth.ts';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'neutral', outfile: join(directory, 'worker.mjs'),
});
export const worker = await import(pathToFileURL(join(directory, 'worker.mjs')));

export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_reader.sql', import.meta.url), 'utf8'));
  function prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
    };
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

export async function fixture() {
  const env = { DB: database(), ASSETS: { fetch: async () => new Response('asset') } };
  const token = 'a'.repeat(64);
  await env.DB.prepare('INSERT INTO api_tokens(id, name, token_hash) VALUES (?, ?, ?)').bind('test', 'test', await worker.hashToken(token)).run();
  const pending = [];
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  async function request(path, method = 'GET', body, headers = {}) {
    return worker.default.fetch(new Request(`https://reader.test/api${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, ctx);
  }
  return { env, ctx, token, request, async settle() { await Promise.all(pending.splice(0)); } };
}
