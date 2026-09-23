'use strict';

// Claude Code writes every assistant message with its token usage to
// <config>/projects/**/*.jsonl. That covers Pro, Max, Team, Enterprise and API
// key logins alike, because the log is written by the CLI, not the account.
//
// Subscription limits (5 hour and weekly windows) live only on the server. The
// OAuth usage endpoint is the one Claude Code's /usage calls; reading it is
// opt-in because it reuses the Claude Code login token.

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { eachJsonLine, listFiles, parseFiles } = require('./scan');

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const FETCH_TIMEOUT_MS = 15_000;

function claudeDirs(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR) return env.CLAUDE_CONFIG_DIR.split(',').map((dir) => dir.trim());
  return [path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.config', 'claude')];
}

// The same message is logged again when a session is resumed or forked, so
// each record carries an id for dedupe across files.
function parseClaudeLog(text) {
  const records = [];
  eachJsonLine(text, (row) => {
    const usage = row.message?.usage;
    if (row.type !== 'assistant' || !usage) return;
    if (row.message.model === '<synthetic>') return;
    const ts = Date.parse(row.timestamp);
    if (Number.isNaN(ts)) return;
    records.push({
      id: `${row.message.id ?? ''}:${row.requestId ?? ''}`,
      ts,
      model: row.message.model ?? '',
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
    });
  });
  return records;
}

function dedupe(recordLists) {
  const seen = new Set();
  const records = [];
  for (const list of recordLists) {
    for (const record of list) {
      if (record.id !== ':' && seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    }
  }
  return records;
}

async function collectClaudeRecords(sinceMs, cache, env = process.env) {
  const files = [];
  for (const dir of claudeDirs(env)) {
    files.push(...(await listFiles(path.join(dir, 'projects'), '.jsonl', sinceMs)));
  }
  return dedupe(await parseFiles(files, parseClaudeLog, cache));
}

const LIMIT_LABELS = [
  ['five_hour', '5h'],
  ['seven_day', '7d'],
  ['seven_day_sonnet', '7d Sonnet'],
  ['seven_day_opus', '7d Opus'],
];

function parseClaudeLimits(json) {
  const windows = [];
  for (const [key, label] of LIMIT_LABELS) {
    const window = json?.[key];
    if (!window || typeof window.utilization !== 'number') continue;
    windows.push({ label, percent: window.utilization, resetsAt: Date.parse(window.resets_at) || null });
  }
  return windows;
}

// Same order Claude Code uses: env, credentials file, macOS keychain.
async function readClaudeToken(env = process.env) {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return env.CLAUDE_CODE_OAUTH_TOKEN;
  for (const dir of claudeDirs(env)) {
    const text = await fs.readFile(path.join(dir, '.credentials.json'), 'utf-8').catch(() => null);
    const token = text && JSON.parse(text).claudeAiOauth?.accessToken;
    if (token) return token;
  }
  if (process.platform !== 'darwin') return null;
  const secret = await new Promise((resolve) => {
    execFile('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], (error, stdout) =>
      resolve(error ? null : stdout.trim())
    );
  });
  if (!secret) return null;
  return JSON.parse(secret).claudeAiOauth?.accessToken ?? null;
}

async function fetchClaudeLimits(token) {
  const response = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
      'User-Agent': 'claude-code/2.0.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Claude usage API ${response.status}`);
  return parseClaudeLimits(await response.json());
}

module.exports = {
  claudeDirs,
  collectClaudeRecords,
  dedupe,
  fetchClaudeLimits,
  parseClaudeLimits,
  parseClaudeLog,
  readClaudeToken,
};
