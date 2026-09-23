'use strict';

// Turns collected sections into the menu bar title and menu lines. Pure, so
// the whole display is testable without Electron.

const SHORT_NAMES = { claude: 'C', codex: 'X', kiro: 'K' };
const PERIODS = [
  ['today', 'Today'],
  ['week', '7 days'],
  ['month', '30 days'],
];

function formatTokens(n) {
  const units = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) return `${(n / size).toFixed(n / size >= 100 ? 0 : 1)}${suffix}`;
  }
  return String(Math.round(n));
}

function formatUsd(n) {
  return `$${n.toFixed(2)}`;
}

function formatReset(resetsAt, now) {
  if (!resetsAt) return '';
  const minutes = Math.max(0, Math.round((resetsAt - now) / 60000));
  if (minutes < 60) return `resets in ${minutes}m`;
  if (minutes < 48 * 60) return `resets in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `resets ${new Date(resetsAt).toISOString().slice(0, 10)}`;
}

// The title shows the tightest limit per product, since that is the one about
// to stop work. Without limits it falls back to today's tokens.
function titlePart(section) {
  const short = SHORT_NAMES[section.id];
  if (!short || section.error) return null;
  if (section.limits?.length) {
    const worst = Math.max(...section.limits.map((limit) => limit.percent));
    return `${short} ${Math.round(worst)}%`;
  }
  if (section.tokens) return `${short} ${formatTokens(section.tokens.today.total)}`;
  return null;
}

function formatTitle(sections) {
  const parts = sections.map(titlePart).filter(Boolean);
  return parts.length ? parts.join(' · ') : 'AI –';
}

function sectionLines(section, now) {
  const lines = [];
  if (section.error) return [`Error: ${section.error}`];
  if (section.plan) lines.push(`Plan: ${section.plan}`);
  for (const limit of section.limits ?? []) {
    const reset = formatReset(limit.resetsAt, now);
    lines.push(`${limit.label}: ${Math.round(limit.percent)}%${reset ? ` (${reset})` : ''}`);
  }
  if (section.limitError) lines.push(`Limits: ${section.limitError}`);
  if (section.credits) lines.push(`Credits: ${section.credits.used} / ${section.credits.limit}`);
  if (section.tokens) {
    for (const [key, label] of PERIODS) {
      const totals = section.tokens[key];
      const cost = totals.usd > 0 ? ` · ${formatUsd(totals.usd)}` : '';
      lines.push(
        `${label}: ${formatTokens(totals.total)} tokens (in ${formatTokens(totals.input)}, out ${formatTokens(
          totals.output
        )}, cache ${formatTokens(totals.cacheRead + totals.cacheWrite)})${cost}`
      );
    }
  }
  return lines;
}

module.exports = { formatReset, formatTitle, formatTokens, formatUsd, sectionLines };
