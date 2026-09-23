'use strict';

// Codex CLI writes each session to <CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl.
// A token_count event carries the running session total, the last call's usage
// and the account's rate limit windows, so both tokens and subscription limits
// come from local files without any login token.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { eachJsonLine, listFiles, parseFiles } = require('./scan');

function codexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

// OpenAI counts cached input inside input_tokens and reasoning inside
// output_tokens, so only the cached part is split out.
function toRecord(ts, usage) {
  const cached = usage.cached_input_tokens ?? 0;
  return {
    ts,
    input: (usage.input_tokens ?? 0) - cached,
    output: usage.output_tokens ?? 0,
    cacheRead: cached,
    cacheWrite: 0,
  };
}

function windowLabel(minutes) {
  if (!minutes) return 'limit';
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

// Older Codex builds send resets_in_seconds, newer ones resets_at in unix seconds.
function parseCodexLimits(rateLimits, ts) {
  const windows = [];
  for (const key of ['primary', 'secondary']) {
    const window = rateLimits?.[key];
    if (!window || typeof window.used_percent !== 'number') continue;
    let resetsAt = null;
    if (window.resets_at) resetsAt = window.resets_at * 1000;
    else if (window.resets_in_seconds != null) resetsAt = ts + window.resets_in_seconds * 1000;
    windows.push({ label: windowLabel(window.window_minutes), percent: window.used_percent, resetsAt });
  }
  return { ts, plan: rateLimits?.plan_type ?? null, windows };
}

// The same token_count event is repeated when nothing new was billed, so a
// record is kept only when the session total moved.
function parseCodexLog(text) {
  const records = [];
  let limits = null;
  let lastTotal = -1;
  eachJsonLine(text, (row) => {
    const payload = row.payload;
    if (row.type !== 'event_msg' || payload?.type !== 'token_count') return;
    const ts = Date.parse(row.timestamp);
    if (Number.isNaN(ts)) return;
    const info = payload.info;
    if (info?.last_token_usage) {
      const total = info.total_token_usage?.total_tokens ?? -1;
      if (total === -1 || total !== lastTotal) records.push(toRecord(ts, info.last_token_usage));
      lastTotal = total;
    }
    if (payload.rate_limits) limits = parseCodexLimits(payload.rate_limits, ts);
  });
  return { records, limits };
}

async function collectCodex(sinceMs, cache, env = process.env) {
  const home = codexHome(env);
  if (!fs.existsSync(home)) throw new Error(`${home} not found`);
  const files = [
    ...(await listFiles(path.join(home, 'sessions'), '.jsonl', sinceMs)),
    ...(await listFiles(path.join(home, 'archived_sessions'), '.jsonl', sinceMs)),
  ];
  const parsed = await parseFiles(files, parseCodexLog, cache);
  const records = parsed.flatMap((entry) => entry.records);
  const limits = parsed
    .map((entry) => entry.limits)
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)[0] ?? null;
  return { records, limits };
}

module.exports = { codexHome, collectCodex, parseCodexLimits, parseCodexLog, windowLabel };
