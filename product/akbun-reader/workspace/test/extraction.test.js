import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, worker } from './helpers.js';

const paragraph = 'Read carefully and remember the useful ideas. '.repeat(8);
const page = `<html><head><title>Article &amp; notes</title></head><body><nav>Navigation</nav><article><h1>Learning</h1><p>${paragraph}</p></article><footer>Footer</footer></body></html>`;
function dns(url) {
  return Response.json({ Status: 0, Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
}
function htmlResponse(html = page, headers = {}) {
  return new Response(html, { headers: { 'content-type': 'text/html; charset="utf-8"', ...headers } });
}

test('extracts article title, Markdown and text without active content or page chrome', () => {
  const html = page.replace('</article>', '<script>steal()</script><style>.bad{}</style><p hidden>secret hidden</p><p onclick="attack()">Visible &lt;script&gt;text&lt;/script&gt;</p><iframe>hidden</iframe></article>');
  const result = worker.extractHtml(html);
  assert.equal(result.title, 'Article & notes');
  assert.match(result.body, /# Learning/);
  assert.match(result.body, /Visible <script>text<\/script>/);
  assert.doesNotMatch(result.body, /Navigation|Footer|steal|attack|secret hidden|\.bad/);
});

test('handles fragments, malformed HTML, main fallback and entity chunk boundaries', () => {
  assert.match(worker.extractHtml(`<main><p>${paragraph}<p>fish &amp; chips</main>`).body, /fish & chips/);
  assert.match(worker.extractHtml(`<p>${paragraph}</p>`).body, /Read carefully/);
  assert.equal(worker.extractHtml(page.replace('<title>', '<meta property="og:title" content="Preferred"><title>')).title, 'Preferred');
  assert.throws(() => worker.extractHtml('<div>'.repeat(130) + paragraph), /complex_html/);
  assert.throws(() => worker.extractHtml('<script>only script</script>'), /empty_body/);
});

test('blocks private and alternative IP syntax, credentials, ports and local names', () => {
  for (const url of ['http://127.1', 'http://2130706433', 'http://0x7f000001', 'http://10.0.0.1', 'http://169.254.169.254', 'http://100.64.0.1', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://[fc00::1]', 'http://localhost.', 'http://printer.local', 'http://service.internal', 'https://user:pass@example.com', 'https://example.com:8443', 'file:///etc/passwd']) {
    assert.throws(() => worker.publicUrl(url), undefined, url);
  }
  assert.equal(worker.publicUrl('https://example.com/a#fragment').href, 'https://example.com/a');
});

test('checks A and AAAA records, rejects mixed DNS answers and resolver failure', async () => {
  let pageRequests = 0;
  for (const response of [{ Status: 0, Answer: [{ type: 1, data: '93.184.215.14' }, { type: 28, data: '::1' }] }, { Status: 2 }, { Status: 0, Answer: [] }]) {
    await assert.rejects(worker.fetchHtml('https://example.com', async url => {
      if (url.hostname !== 'cloudflare-dns.com') pageRequests++;
      return Response.json(response);
    }));
  }
  assert.equal(pageRequests, 0);
});

test('redirects are bounded and checked, upstream never receives API credentials', async () => {
  const visited = [];
  const fetched = await worker.fetchHtml('https://example.com/first', async (url, options) => {
    if (url.hostname === 'cloudflare-dns.com') return dns(url);
    visited.push(url.href);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.cookie, undefined);
    assert.ok(options.signal);
    return url.pathname === '/first' ? new Response(null, { status: 302, headers: { location: '/second' } }) : htmlResponse();
  });
  assert.match(fetched, /Learning/); assert.equal(visited.length, 2);
  for (const location of ['http://127.0.0.1/admin', 'http://example.com/downgrade']) {
    await assert.rejects(worker.fetchHtml('https://example.com', async url => url.hostname === 'cloudflare-dns.com' ? dns(url) : new Response(null, { status: 302, headers: { location } })), /blocked_url/);
  }
  await assert.rejects(worker.fetchHtml('https://example.com', async url => url.hostname === 'cloudflare-dns.com' ? dns(url) : new Response(null, { status: 302, headers: { location: '/loop' } })), /redirect_limit/);
});

test('limits streamed bytes even with no content-length and rejects unsupported content', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(64_000)); }, cancel() { cancelled = true; } });
  await assert.rejects(worker.limitedText(new Response(stream), 100_000), /response_too_large/);
  assert.equal(cancelled, true);
  for (const response of [new Response('PDF', { headers: { 'content-type': 'application/pdf' } }), htmlResponse(page, { 'content-type': 'text/html; charset=euc-kr' }), new Response('unavailable', { status: 503 }), htmlResponse(page, { 'content-length': '300000' })]) {
    await assert.rejects(worker.fetchHtml('https://example.com', async url => url.hostname === 'cloudflare-dns.com' ? dns(url) : response));
  }
});

test('URL-only save responds before extraction and deduplicates pending work', async () => {
  const f = await fixture(); const originalFetch = globalThis.fetch;
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  let requests = 0;
  globalThis.fetch = async url => {
    if (url.hostname === 'cloudflare-dns.com') return dns(url);
    requests++; await delayed; return htmlResponse();
  };
  try {
    const response = await f.request('/documents', 'POST', { url: 'https://example.com/article', tags: ['reading'] });
    assert.equal(response.status, 201);
    const saved = await response.json(); assert.equal(saved.extraction_status, 'pending'); assert.equal(saved.body, '');
    const duplicate = await (await f.request('/documents', 'POST', { url: 'https://example.com/article#fragment' })).json();
    assert.equal(duplicate.id, saved.id);
    release(); await f.settle();
    const finished = await (await f.request(`/documents/${saved.id}`)).json();
    assert.equal(finished.extraction_status, 'done'); assert.equal(finished.title, 'Article & notes');
    assert.match(finished.body, /Read carefully/); assert.equal(finished.ai_status, 'skipped');
    assert.equal(requests, 1);
  } finally { release(); await f.settle(); globalThis.fetch = originalFetch; }
});

test('failed extraction preserves URL, custom title and tags; supplied body avoids fetching', async () => {
  const f = await fixture(); const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('timeout'); };
  try {
    const saved = await (await f.request('/documents', 'POST', { url: 'https://example.com/offline', title: 'Keep title', tags: ['reading'] })).json();
    await f.settle();
    const failed = await (await f.request(`/documents/${saved.id}`)).json();
    assert.equal(failed.extraction_status, 'failed'); assert.equal(failed.title, 'Keep title'); assert.deepEqual(failed.tags, ['reading']);
    assert.equal(failed.normalized_url, 'https://example.com/offline'); assert.equal(failed.ai_status, 'skipped');
    const provided = await (await f.request('/documents', 'POST', { url: 'https://example.com/provided', body: paragraph })).json();
    await f.settle(); assert.equal(provided.extraction_status, 'provided'); assert.equal(provided.body, paragraph.trim());
  } finally { globalThis.fetch = originalFetch; }
});
