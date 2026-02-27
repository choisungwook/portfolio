import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FEEDS_PATH = join(ROOT, 'feeds.json');
const TEMPLATE_PATH = join(ROOT, 'frontend', 'index.html');
const DIST_DIR = join(ROOT, 'dist');
const OUTPUT_PATH = join(DIST_DIR, 'index.html');

const ITEMS_PER_SOURCE = 10;
const FETCH_TIMEOUT_MS = 15000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
});

function stripHtml(html) {
  if (!html) return '';
  let text = String(html);
  // Handle CDATA
  if (typeof text === 'object' && text['#cdata']) text = text['#cdata'];
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function truncate(text, maxLen = 120) {
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen).trimEnd() + '...';
}

function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node['#cdata']) return String(node['#cdata']);
  if (node['#text']) return String(node['#text']);
  return String(node);
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AkbunWeeklyBot/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(xml, source) {
  const parsed = parser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) return [];

  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

  return rawItems.slice(0, ITEMS_PER_SOURCE).map(item => {
    const description = extractText(item.description);
    return {
      title: extractText(item.title),
      link: extractText(item.link),
      summary: truncate(stripHtml(description)),
      date: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      color: source.color,
    };
  }).filter(item => item.title && item.link);
}

function parseAtomItems(xml, source) {
  const parsed = parser.parse(xml);
  const feed = parsed?.feed;
  if (!feed) return [];

  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

  return entries.slice(0, ITEMS_PER_SOURCE).map(entry => {
    const mediaGroup = entry['media:group'] || {};
    const description = extractText(mediaGroup['media:description']) || extractText(entry.summary);
    const thumbnail = mediaGroup['media:thumbnail']?.['@_url'] || null;
    const link = entry.link?.['@_href'] || extractText(entry.link);
    const videoId = extractText(entry['yt:videoId']);

    return {
      title: extractText(entry.title),
      link: link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
      summary: truncate(stripHtml(description)),
      date: entry.published ? new Date(entry.published).toISOString() : null,
      thumbnail,
      sourceId: source.id,
      sourceName: source.name,
      category: source.category,
      color: source.color,
      isVideo: true,
    };
  }).filter(item => item.title && item.link);
}

async function fetchSource(source) {
  const urls = [];

  if (source.type === 'youtube') {
    if (!source.channelId || source.channelId === 'REPLACE_WITH_CHANNEL_ID') {
      console.warn(`  Skipping ${source.name}: channel ID not configured`);
      return [];
    }
    urls.push(`https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`);
  } else {
    urls.push(source.url);
    if (source.fallbackUrls) urls.push(...source.fallbackUrls);
  }

  for (const url of urls) {
    try {
      console.log(`  Fetching ${url}`);
      const xml = await fetchWithTimeout(url);

      if (source.type === 'youtube') {
        return parseAtomItems(xml, source);
      }
      return parseRssItems(xml, source);
    } catch (err) {
      console.warn(`  Failed ${url}: ${err.message}`);
    }
  }

  console.warn(`  All URLs failed for ${source.name}`);
  return [];
}

function generateBuildDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

async function main() {
  console.log('=== Akbun Content Aggregator Build ===\n');

  const config = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const allItems = [];

  for (const source of config.sources) {
    console.log(`[${source.name}]`);
    const items = await fetchSource(source);
    console.log(`  Found ${items.length} items\n`);
    allItems.push(...items);
  }

  // Sort by date (newest first), items without dates go last
  allItems.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  const feedData = {
    buildDate: generateBuildDate(),
    itemCount: allItems.length,
    items: allItems,
  };

  console.log(`Total items: ${allItems.length}`);

  // Read HTML template and inject data
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const dataScript = `<script>window.__FEED_DATA__=${JSON.stringify(feedData)};</script>`;
  const output = template.replace('<!--__FEED_DATA__-->', dataScript);

  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, output, 'utf-8');
  console.log(`\nOutput: ${OUTPUT_PATH}`);
  console.log('Build complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
