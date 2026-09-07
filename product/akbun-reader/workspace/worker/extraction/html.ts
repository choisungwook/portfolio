import { Parser } from 'htmlparser2';

const excluded = new Set(['script', 'style', 'noscript', 'iframe', 'svg', 'math', 'template', 'form', 'nav', 'header', 'footer', 'aside']);
const blocks = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'blockquote', 'pre', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

interface Candidate { kind: string; start: number; end: number; length: number }
interface Frame { ignored: boolean; title: boolean; candidate?: Candidate; startLength: number }

export function extractHtml(html: string): { title: string; body: string } {
  const chunks: string[] = [];
  const stack: Frame[] = [];
  const candidates: Candidate[] = [];
  const title: string[] = [];
  let metadataTitle = '';
  let length = 0;
  let elements = 0;
  const append = (value: string) => { chunks.push(value); length += value.length; };
  const parser = new Parser({
    onopentag(name, attributes) {
      if (++elements > 20_000 || stack.length >= 128) throw new Error('complex_html');
      const parent = stack.at(-1);
      const isTitle = name === 'title';
      const hidden = 'hidden' in attributes || attributes['aria-hidden'] === 'true' ||
        /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style ?? '');
      const ignored = Boolean(parent?.ignored || excluded.has(name) || name === 'head' || hidden);
      if (name === 'meta' && attributes.property === 'og:title') metadataTitle ||= attributes.content ?? '';
      const frame: Frame = { ignored, title: isTitle || Boolean(parent?.title), startLength: length };
      if (!ignored && (name === 'main' || name === 'article') && candidates.length < 32) {
        frame.candidate = { kind: name, start: chunks.length, end: chunks.length, length: 0 };
        candidates.push(frame.candidate);
      }
      stack.push(frame);
      if (!ignored && blocks.has(name)) append('\n\n');
      if (!ignored && /^h[1-6]$/.test(name)) append(`${'#'.repeat(Number(name[1]))} `);
      if (!ignored && name === 'li') append('- ');
    },
    ontext(value) {
      const frame = stack.at(-1);
      if (frame?.title) title.push(value);
      if (!frame?.ignored) append(value);
    },
    onclosetag(name) {
      const frame = stack.pop();
      if (!frame) return;
      if (!frame.ignored && blocks.has(name)) append('\n\n');
      if (frame.candidate) {
        frame.candidate.end = chunks.length;
        frame.candidate.length = length - frame.startLength;
      }
    },
  }, { decodeEntities: true });
  parser.end(html);
  const articles = candidates.filter(candidate => candidate.kind === 'article' && candidate.length >= 80);
  const mains = candidates.filter(candidate => candidate.kind === 'main' && candidate.length >= 80);
  const selected = (articles.length ? articles : mains).sort((a, b) => b.length - a.length)[0];
  const content = (selected ? chunks.slice(selected.start, selected.end) : chunks).join('');
  const body = content.split('\n').map(line => line.replace(/[\t\r\f ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (body.length < 40) throw new Error('empty_body');
  if (body.length > 100_000) throw new Error('body_too_large');
  return { title: (metadataTitle || title.join('')).replace(/\s+/g, ' ').trim().slice(0, 500), body };
}
