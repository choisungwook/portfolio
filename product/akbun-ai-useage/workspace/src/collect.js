'use strict';

// Runs every enabled source and returns one section per source. A source that
// fails keeps its section with an error line, so one broken login does not
// hide the others.

const { fetchAnthropicOrg, fetchOpenAIOrg } = require('./admin');
const { collectClaudeRecords, fetchClaudeLimits, readClaudeToken } = require('./claude');
const { collectCodex } = require('./codex');
const { runKiroUsage } = require('./kiro');
const { aggregate, DAY_MS } = require('./tokens');

const caches = { claude: new Map(), codex: new Map() };

async function section(id, name, load) {
  try {
    return { id, name, ...(await load()) };
  } catch (error) {
    return { id, name, error: error.message || String(error) };
  }
}

function collect(settings, now = Date.now()) {
  const since = now - 31 * DAY_MS;
  const jobs = [];

  if (settings.claude.enabled) {
    jobs.push(
      section('claude', 'Claude Code', async () => {
        const tokens = aggregate(await collectClaudeRecords(since, caches.claude), now);
        if (!settings.claude.limits) return { tokens };
        const token = await readClaudeToken();
        if (!token) return { tokens, limitError: 'no Claude Code login found' };
        try {
          return { tokens, limits: await fetchClaudeLimits(token) };
        } catch (error) {
          return { tokens, limitError: error.message };
        }
      })
    );
  }

  if (settings.codex.enabled) {
    jobs.push(
      section('codex', 'Codex', async () => {
        const { records, limits } = await collectCodex(since, caches.codex);
        return { tokens: aggregate(records, now), limits: limits?.windows, plan: limits?.plan };
      })
    );
  }

  if (settings.kiro.enabled) {
    jobs.push(
      section('kiro', 'Kiro', async () => {
        const usage = await runKiroUsage(settings.kiro.command);
        return {
          plan: usage.plan,
          credits: { used: usage.used, limit: usage.limit },
          limits: [{ label: 'month', percent: usage.percent, resetsAt: usage.resetsAt }],
        };
      })
    );
  }

  if (settings.anthropicAdmin.apiKey) {
    jobs.push(
      section('anthropic-org', 'Anthropic org', async () => ({
        tokens: aggregate(await fetchAnthropicOrg(settings.anthropicAdmin.apiKey, now), now),
      }))
    );
  }

  if (settings.openaiAdmin.apiKey) {
    jobs.push(
      section('openai-org', 'OpenAI org', async () => ({
        tokens: aggregate(await fetchOpenAIOrg(settings.openaiAdmin.apiKey, now), now),
      }))
    );
  }

  return Promise.all(jobs);
}

module.exports = { collect };
