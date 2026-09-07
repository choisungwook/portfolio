import { Parser } from 'htmlparser2';

export interface FeedItem { guid: string; url: string; title: string; summary: string; published_at: string | null }
export interface ParsedFeed { title: string; items: FeedItem[] }

export const MAX_FEED_ITEMS = 100;
const itemTags = new Set(['item', 'entry']);
const fields: Record<string, keyof Draft> = {
  title: 'title', link: 'link', guid: 'guid', id: 'guid', description: 'summary', summary: 'summary',
  'content:encoded': 'content', content: 'content', pubdate: 'date', published: 'date', updated: 'date', 'dc:date': 'date',
};
interface Draft { title: string; link: string; guid: string; summary: string; content: string; date: string; href: string }

const skipped = new Set(['script', 'style', 'noscript', 'template']);

export function stripHtml(html: string): string {
  const chunks: string[] = [];
  let skip = 0;
  const parser = new Parser({
    onopentag(name) { if (skipped.has(name)) skip++; else chunks.push(' '); },
    ontext(value) { if (!skip) chunks.push(value); },
    onclosetag(name) { if (skipped.has(name)) skip = Math.max(0, skip - 1); else chunks.push(' '); },
  }, { decodeEntities: true });
  parser.end(html);
  return chunks.join('').replace(/\s+/g, ' ').trim();
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  const items: FeedItem[] = [];
  const titleChunks: string[] = [];
  const stack: string[] = [];
  let draft: Draft | null = null;
  let field: keyof Draft | null = null;
  let depth = 0;
  let text: string[] = [];
  let elements = 0;
  const parser = new Parser({
    onopentag(rawName, attributes) {
      if (++elements > 50_000 || stack.length >= 64) throw new Error('complex_feed');
      const name = rawName.toLowerCase();
      stack.push(name);
      if (draft) {
        if (name === 'link' && attributes.href && (!attributes.rel || attributes.rel === 'alternate') && !draft.href) draft.href = attributes.href;
        field = stack.length === depth + 1 ? fields[name] ?? null : null;
        text = [];
      } else if (itemTags.has(name) && items.length < MAX_FEED_ITEMS) {
        draft = { title: '', link: '', guid: '', summary: '', content: '', date: '', href: '' };
        depth = stack.length;
      } else if (name === 'title' && stack.length === 2 || (name === 'title' && stack.length === 3 && stack[1] === 'channel')) {
        field = 'title'; text = [];
      }
    },
    ontext(value) { if (field) text.push(value); },
    onclosetag(rawName) {
      const name = rawName.toLowerCase();
      if (field) {
        const value = text.join('').trim();
        if (draft) { if (!draft[field]) draft[field] = value; }
        else if (!titleChunks.length && value) titleChunks.push(value);
        field = null;
      }
      if (draft && itemTags.has(name) && stack.length === depth) {
        const item = finish(draft, feedUrl);
        if (item) items.push(item);
        draft = null;
      }
      stack.pop();
    },
  }, { xmlMode: true, decodeEntities: true });
  parser.end(xml);
  if (!stack.length && elements === 0) throw new Error('empty_feed');
  return { title: titleChunks.join('').replace(/\s+/g, ' ').trim().slice(0, 500), items };
}

function finish(draft: Draft, feedUrl: string): FeedItem | null {
  const rawLink = draft.href || draft.link || (/^https?:\/\//i.test(draft.guid) ? draft.guid : '');
  let url: URL;
  try {
    url = new URL(rawLink, feedUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch { return null; }
  const title = stripHtml(draft.title).slice(0, 500) || url.href.slice(0, 500);
  const summary = stripHtml(draft.summary || draft.content).slice(0, 500);
  const parsed = Date.parse(draft.date);
  return {
    guid: (draft.guid || url.href).slice(0, 2000), url: url.href.slice(0, 4000), title, summary,
    published_at: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
  };
}
