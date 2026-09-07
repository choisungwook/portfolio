import test from 'node:test';
import assert from 'node:assert/strict';
import { accessHeaders, fixture, worker } from './helpers.js';

const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>블로그 &amp; 노트</title><link>https://blog.example.com</link>
<item><title><![CDATA[첫 글]]></title><link>https://blog.example.com/posts/first?utm_source=rss</link><guid isPermaLink="false">post-1</guid><pubDate>Mon, 01 Sep 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>요약 <b>본문</b><script>x()</script></p>]]></description></item>
<item><title>둘째 글</title><link>/posts/second</link><content:encoded><![CDATA[긴 본문]]></content:encoded></item>
<item><title>잘못된 링크</title><link>javascript:alert(1)</link></item>
</channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom 피드</title><link rel="self" href="https://atom.example.com/feed"/>
<entry><title>Entry one</title><id>urn:one</id><link rel="alternate" href="https://atom.example.com/one"/><updated>2026-09-02T00:00:00Z</updated><summary>Short</summary></entry>
<entry><title>Entry two</title><id>https://atom.example.com/two</id><published>2026-09-03T00:00:00Z</published><content type="html">&lt;p&gt;Content&lt;/p&gt;</content></entry></feed>`;
const dns = url => Response.json({ Status: 0, Answer: url.searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.215.14' }] : [] });
function feedFetcher(bodies) {
  return async url => {
    if (url.hostname === 'cloudflare-dns.com') return dns(url);
    const body = bodies[url.href];
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(body, { headers: { 'content-type': url.pathname.endsWith('.html') ? 'text/html' : 'application/rss+xml; charset=utf-8' } });
  };
}

test('parses RSS, Atom, CDATA, relative links, dates and drops unsafe links', () => {
  const parsed = worker.parseFeed(rss, 'https://blog.example.com/feed.xml');
  assert.equal(parsed.title, '블로그 & 노트');
  assert.equal(parsed.items.length, 2);
  assert.deepEqual(parsed.items[0], { guid: 'post-1', url: 'https://blog.example.com/posts/first?utm_source=rss', title: '첫 글', summary: '요약 본문', published_at: '2026-09-01T09:00:00.000Z' });
  assert.equal(parsed.items[1].url, 'https://blog.example.com/posts/second');
  assert.equal(parsed.items[1].summary, '긴 본문');
  assert.equal(parsed.items[1].published_at, null);
  const entries = worker.parseFeed(atom, 'https://atom.example.com/feed');
  assert.equal(entries.title, 'Atom 피드');
  assert.deepEqual(entries.items.map(item => [item.guid, item.url, item.published_at, item.summary]), [
    ['urn:one', 'https://atom.example.com/one', '2026-09-02T00:00:00.000Z', 'Short'], ['https://atom.example.com/two', 'https://atom.example.com/two', '2026-09-03T00:00:00.000Z', 'Content'],
  ]);
  const many = `<rss><channel><title>t</title>${'<item><title>x</title><link>https://a.example.com/x</link></item>'.repeat(150)}</channel></rss>`;
  assert.equal(worker.parseFeed(many, 'https://a.example.com').items.length, worker.MAX_FEED_ITEMS);
  assert.equal(worker.parseFeed('<html><body>not a feed</body></html>', 'https://a.example.com').items.length, 0);
  assert.throws(() => worker.parseFeed('', 'https://a.example.com'), /empty_feed/);
});

test('feed registration collects items, deduplicates on refresh and joins saved documents', async () => {
  const f = await fixture();
  const fetcher = feedFetcher({ 'https://blog.example.com/feed.xml': rss });
  assert.equal((await f.request('/feeds', 'POST', { url: 'http://10.0.0.1/feed' })).status, 400);
  assert.equal((await f.request('/feeds', 'POST', { url: 'ftp://blog.example.com/feed' })).status, 400);
  await f.env.DB.prepare("INSERT INTO feeds(id, url, title) VALUES ('feed1', 'https://blog.example.com/feed.xml', 'https://blog.example.com/feed.xml')").run();
  assert.deepEqual(await worker.refreshFeed('feed1', f.env, fetcher), { added: 2 });
  assert.deepEqual(await worker.refreshFeed('feed1', f.env, fetcher), { added: 0 });
  const feed = await (await f.request('/feeds/feed1')).json();
  assert.equal(feed.title, '블로그 & 노트'); assert.equal(feed.item_count, 2); assert.equal(feed.fetch_status, 'done');
  const page = await (await f.request('/feed-items?feed=feed1')).json();
  assert.deepEqual(page.items.map(item => item.title), ['둘째 글', '첫 글']);
  assert.equal(page.items[1].normalized_url, 'https://blog.example.com/posts/first');
  assert.equal(page.items[1].document_id, null);
  assert.equal((await f.request('/documents', 'POST', { url: 'https://blog.example.com/posts/first', body: '본문' })).status, 201);
  await f.settle();
  assert.ok((await (await f.request('/feed-items')).json()).items[1].document_id);
  assert.equal((await f.request('/feed-items?offset=-1')).status, 400);
  const duplicate = await f.request('/feeds', 'POST', { url: 'https://blog.example.com/feed.xml#top' });
  assert.equal(duplicate.status, 200);
  assert.equal((await (await f.request('/feeds')).json()).feeds.length, 1);
});

test('feed fetch failure keeps the feed, unsupported content fails and deletion removes items and share', async () => {
  const f = await fixture();
  await f.env.DB.prepare("INSERT INTO feeds(id, url, title) VALUES ('feed1', 'https://blog.example.com/page.html', 'x')").run();
  await f.env.DB.prepare("INSERT INTO feeds(id, url, title) VALUES ('feed2', 'https://blog.example.com/missing', 'y')").run();
  const fetcher = feedFetcher({ 'https://blog.example.com/page.html': '<html>' });
  await worker.refreshFeed('feed1', f.env, fetcher);
  await worker.refreshFeed('feed2', f.env, fetcher);
  for (const id of ['feed1', 'feed2']) assert.equal((await (await f.request(`/feeds/${id}`)).json()).fetch_status, 'failed');
  await f.env.DB.prepare("INSERT INTO feed_items(id, feed_id, guid, normalized_url, title, published_at) VALUES ('i1', 'feed1', 'g', 'https://blog.example.com/a', 'a', '2026-09-01T00:00:00Z')").run();
  await f.env.DB.prepare("INSERT INTO shares(id, kind, target) VALUES ('s1', 'feed', 'feed1')").run();
  assert.equal((await f.request('/feeds/feed1', 'DELETE')).status, 200);
  assert.equal((await f.request('/feeds/feed1', 'DELETE')).status, 404);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM feed_items').first()).n, 0);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM shares').first()).n, 0);
});

test('scheduled refresh only touches stale feeds and caps items per feed', async () => {
  const f = await fixture();
  const fetched = [];
  const fetcher = async url => {
    if (url.hostname === 'cloudflare-dns.com') return dns(url);
    fetched.push(url.href);
    const items = Array.from({ length: 60 }, (_, i) => `<item><title>${i}</title><link>${url.href}/${i}</link><pubDate>2026-09-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z</pubDate></item>`).join('');
    return new Response(`<rss><channel><title>t</title>${items}</channel></rss>`, { headers: { 'content-type': 'text/xml' } });
  };
  for (let i = 0; i < 6; i++) {
    await f.env.DB.prepare('INSERT INTO feeds(id, url, title, fetched_at) VALUES (?, ?, ?, ?)')
      .bind(`f${i}`, `https://blog${i}.example.com/feed`, 'x', i === 5 ? new Date().toISOString() : null).run();
  }
  await worker.refreshStaleFeeds(f.env, fetcher);
  assert.equal(fetched.length, worker.FEEDS_PER_CRON);
  assert.ok(!fetched.includes('https://blog5.example.com/feed'));
  await worker.refreshStaleFeeds(f.env, fetcher);
  assert.equal(fetched.length, 5);
  await f.env.DB.prepare("UPDATE feeds SET fetched_at = '2026-01-01T00:00:00.000Z' WHERE id = 'f0'").run();
  await worker.refreshStaleFeeds(f.env, fetcher);
  assert.equal(fetched.length, 6);
  const count = await f.env.DB.prepare("SELECT count(*) AS n FROM feed_items WHERE feed_id = 'f0'").first();
  assert.equal(count.n, 60);
});

test('tags are searched, renamed with merge, deleted and shared links follow the rename', async () => {
  const f = await fixture();
  for (const [id, tags] of [['a', ['기술', '책']], ['b', ['기술']], ['c', ['책', '기술']], ['d', ['여행']]]) {
    await f.env.DB.prepare("INSERT INTO documents(id, normalized_url, title, tags_json, ai_status) VALUES (?, ?, ?, ?, 'skipped')").bind(id, `https://e.test/${id}`, id, JSON.stringify(tags)).run();
  }
  await f.env.DB.prepare("INSERT INTO shares(id, kind, target) VALUES ('s1', 'tag', '기술')").run();
  assert.deepEqual((await (await f.request('/tags?q=기')).json()).tags, [{ name: '기술', count: 3 }]);
  assert.equal((await f.request('/tags/없음', 'PATCH', { name: '새' })).status, 404);
  assert.equal((await f.request(`/tags/${encodeURIComponent('기술')}`, 'PATCH', { name: '' })).status, 400);
  const renamed = await f.request(`/tags/${encodeURIComponent('기술')}`, 'PATCH', { name: '책' });
  assert.equal(renamed.status, 200);
  assert.deepEqual((await (await f.request('/tags')).json()).tags, [{ name: '여행', count: 1 }, { name: '책', count: 3 }]);
  const a = await (await f.request('/documents/a')).json();
  assert.deepEqual(a.tags, ['책']); assert.equal(a.version, 2);
  assert.equal((await f.env.DB.prepare("SELECT target FROM shares WHERE id = 's1'").first()).target, '책');
  assert.equal((await (await f.request('/documents?location=all&tag=책')).json()).documents.length, 3);
  assert.equal((await f.request(`/tags/${encodeURIComponent('책')}`, 'DELETE')).status, 200);
  assert.deepEqual((await (await f.request('/tags')).json()).tags, [{ name: '여행', count: 1 }]);
  assert.deepEqual((await (await f.request('/documents/c')).json()).tags, []);
  assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM shares').first()).n, 0);
  const changes = await f.env.DB.prepare("SELECT count(*) AS n FROM changes WHERE operation = 'update'").first();
  assert.equal(changes.n, 6);
});

test('public links need browser login to manage, expose only list data and stop after deletion', async () => {
  const f = await fixture();
  const access = await accessHeaders(f);
  try {
    await f.env.DB.prepare("INSERT INTO documents(id, normalized_url, title, body, tags_json, summary_json, ai_status) VALUES ('a', 'https://e.test/a', '비밀 제목', '비밀 본문', '[\"공개\"]', '[\"한 줄\"]', 'done')").run();
    await f.env.DB.prepare("INSERT INTO feeds(id, url, title) VALUES ('feed1', 'https://blog.example.com/feed', '피드')").run();
    await f.env.DB.prepare("INSERT INTO feed_items(id, feed_id, guid, normalized_url, title, summary, published_at) VALUES ('i1', 'feed1', 'g', 'https://blog.example.com/a', '글', '요약', '2026-09-01T00:00:00Z')").run();
    for (const [method, path, body] of [['GET', '/shares'], ['POST', '/shares', { kind: 'tag', target: '공개' }], ['DELETE', '/shares/x']]) {
      assert.equal((await f.request(path, method, body)).status, 403);
    }
    assert.equal((await f.request('/shares', 'POST', { kind: 'tag', target: '없음' }, access.headers)).status, 404);
    assert.equal((await f.request('/shares', 'POST', { kind: 'feed', target: 'nope' }, access.headers)).status, 404);
    assert.equal((await f.request('/shares', 'POST', { kind: 'x', target: '공개' }, access.headers)).status, 400);
    const created = await f.request('/shares', 'POST', { kind: 'tag', target: '공개' }, access.headers);
    assert.equal(created.status, 201);
    const share = await created.json();
    assert.equal((await f.request('/shares', 'POST', { kind: 'tag', target: '공개' }, access.headers)).status, 200);
    const feedShare = await (await f.request('/shares', 'POST', { kind: 'feed', target: 'feed1' }, access.headers)).json();
    const listed = await (await f.request('/shares', 'GET', undefined, access.headers)).json();
    assert.deepEqual(listed.shares.map(row => [row.kind, row.title]).sort(), [['feed', '피드'], ['tag', '공개']]);
    const open = path => worker.default.fetch(new Request(`https://reader.test${path}`), f.env, f.ctx);
    const page = await open(`/public/${share.id}`);
    assert.equal(page.status, 200); assert.equal(page.headers.get('x-robots-tag'), 'noindex');
    const data = await (await open(`/public/${share.id}/data`)).json();
    assert.equal(data.kind, 'tag'); assert.equal(data.title, '공개');
    assert.deepEqual(data.items[0], { id: 'a', title: '비밀 제목', normalized_url: 'https://e.test/a', summary: ['한 줄'], created_at: data.items[0].created_at });
    const feedData = await (await open(`/public/${feedShare.id}/data`)).json();
    assert.equal(feedData.kind, 'feed'); assert.equal(feedData.items[0].title, '글'); assert.equal(feedData.items[0].document_id, undefined);
    assert.equal((await open('/public/nope')).status, 404);
    assert.equal((await open(`/public/${'0'.repeat(32)}/data`)).status, 404);
    assert.equal((await worker.default.fetch(new Request(`https://reader.test/public/${share.id}/data`, { method: 'POST' }), f.env, f.ctx)).status, 404);
    assert.equal((await f.request(`/shares/${share.id}`, 'DELETE', undefined, access.headers)).status, 200);
    assert.equal((await f.request(`/shares/${share.id}`, 'DELETE', undefined, access.headers)).status, 404);
    assert.equal((await open(`/public/${share.id}/data`)).status, 404);
  } finally { access.restore(); }
});
