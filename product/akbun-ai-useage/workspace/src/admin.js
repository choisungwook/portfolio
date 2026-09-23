'use strict';

// Organization usage from the Anthropic and OpenAI Admin APIs. This is the
// only source for Enterprise or API usage that did not go through a CLI on
// this machine: other members, other machines, direct API calls. Both need an
// admin key, which a regular API key cannot replace.

const { DAY_MS } = require('./tokens');

const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGES = 10;

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${new URL(url).host} ${response.status}`);
  return response.json();
}

// Both APIs page with has_more and next_page; nextUrl turns a page token into a URL.
async function fetchPages(firstUrl, nextUrl, headers) {
  const pages = [];
  let url = firstUrl;
  for (let i = 0; i < MAX_PAGES && url; i++) {
    const page = await getJson(url, headers);
    pages.push(page);
    url = page.has_more && page.next_page ? nextUrl(page.next_page) : null;
  }
  return pages;
}

function parseAnthropicUsagePage(page) {
  return (page.data ?? []).map((bucket) => {
    const record = { ts: Date.parse(bucket.starting_at), input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const result of bucket.results ?? []) {
      const cacheCreation = result.cache_creation ?? {};
      record.input += result.uncached_input_tokens ?? 0;
      record.output += result.output_tokens ?? 0;
      record.cacheRead += result.cache_read_input_tokens ?? 0;
      record.cacheWrite +=
        (cacheCreation.ephemeral_1h_input_tokens ?? 0) + (cacheCreation.ephemeral_5m_input_tokens ?? 0);
    }
    return record;
  });
}

// amount is a decimal string in cents.
function parseAnthropicCostPage(page) {
  return (page.data ?? []).map((bucket) => ({
    ts: Date.parse(bucket.starting_at),
    usd: (bucket.results ?? []).reduce((sum, result) => sum + Number(result.amount ?? 0) / 100, 0),
  }));
}

function parseOpenAIUsagePage(page) {
  return (page.data ?? []).map((bucket) => {
    const record = { ts: bucket.start_time * 1000, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const result of bucket.results ?? []) {
      const cached = result.input_cached_tokens ?? 0;
      record.input += (result.input_tokens ?? 0) - cached;
      record.output += result.output_tokens ?? 0;
      record.cacheRead += cached;
    }
    return record;
  });
}

function parseOpenAICostPage(page) {
  return (page.data ?? []).map((bucket) => ({
    ts: bucket.start_time * 1000,
    usd: (bucket.results ?? []).reduce((sum, result) => sum + Number(result.amount?.value ?? 0), 0),
  }));
}

function sinceDay(now) {
  const start = new Date(now - 30 * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function fetchAnthropicOrg(apiKey, now = Date.now()) {
  const base = 'https://api.anthropic.com/v1/organizations';
  const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  const query = `starting_at=${encodeURIComponent(sinceDay(now).toISOString())}&bucket_width=1d&limit=31`;
  const usageUrl = `${base}/usage_report/messages?${query}`;
  const costUrl = `${base}/cost_report?${query}`;
  const [usagePages, costPages] = await Promise.all([
    fetchPages(usageUrl, (next) => `${usageUrl}&page=${encodeURIComponent(next)}`, headers),
    fetchPages(costUrl, (next) => `${costUrl}&page=${encodeURIComponent(next)}`, headers),
  ]);
  return [...usagePages.flatMap(parseAnthropicUsagePage), ...costPages.flatMap(parseAnthropicCostPage)];
}

async function fetchOpenAIOrg(apiKey, now = Date.now()) {
  const base = 'https://api.openai.com/v1/organization';
  const headers = { Authorization: `Bearer ${apiKey}` };
  const query = `start_time=${Math.floor(sinceDay(now).getTime() / 1000)}&bucket_width=1d&limit=31`;
  const usageUrl = `${base}/usage/completions?${query}`;
  const costUrl = `${base}/costs?${query}`;
  const [usagePages, costPages] = await Promise.all([
    fetchPages(usageUrl, (next) => `${usageUrl}&page=${encodeURIComponent(next)}`, headers),
    fetchPages(costUrl, (next) => `${costUrl}&page=${encodeURIComponent(next)}`, headers),
  ]);
  return [...usagePages.flatMap(parseOpenAIUsagePage), ...costPages.flatMap(parseOpenAICostPage)];
}

module.exports = {
  fetchAnthropicOrg,
  fetchOpenAIOrg,
  parseAnthropicCostPage,
  parseAnthropicUsagePage,
  parseOpenAICostPage,
  parseOpenAIUsagePage,
};
