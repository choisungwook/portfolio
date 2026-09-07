import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const directory = mkdtempSync(join(tmpdir(), 'reader-tests-'));
await build({
  stdin: { contents: "export { default } from './worker/index.ts'; export * from './worker/ai.ts'; export * from './worker/auth.ts'; export * from './worker/extraction/html.ts'; export * from './worker/extraction/fetch.ts'; export * from './worker/extraction/index.ts'; export * from './worker/rss/parse.ts'; export * from './worker/rss/index.ts';", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'], outfile: join(directory, 'worker.mjs'),
});
export const worker = await import(pathToFileURL(join(directory, 'worker.mjs')));

export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
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

/** Access 브라우저 인증 헤더. JWKS 조회는 fetch 라우터로 대체한다. */
export async function accessHeaders(f, routes = {}) {
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = { ...await exportJWK(publicKey), kid: 'test', alg: 'RS256', use: 'sig' };
  Object.assign(f.env, { ACCESS_TEAM_DOMAIN: 'reader-test.cloudflareaccess.com', ACCESS_AUD: 'reader', ACCESS_OWNER_SUB: 'owner' });
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.hostname === 'reader-test.cloudflareaccess.com') return Response.json({ keys: [key] });
    const route = routes[url.hostname];
    if (route) return route(url, options);
    return original(input, options);
  };
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('owner')
    .setIssuer('https://reader-test.cloudflareaccess.com').setAudience('reader').setExpirationTime('1h').sign(privateKey);
  return { headers: { authorization: '', 'Cf-Access-Jwt-Assertion': token, origin: 'https://reader.test' }, restore() { globalThis.fetch = original; } };
}
