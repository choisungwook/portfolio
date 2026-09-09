// Sums over the rows Rust hands back. Nothing here goes to the backend.

import type { DailyRow } from "./api";
import { iso } from "./dates";

export type Totals = {
  earnings: number;
  pageViews: number;
  clicks: number;
  impressions: number;
  rpm: number;
};

export type Named = Totals & { name: string };

export function rpm(earnings: number, pageViews: number): number {
  return pageViews > 0 ? (earnings / pageViews) * 1000 : 0;
}

function finish(t: Omit<Totals, "rpm">): Totals {
  return { ...t, rpm: rpm(t.earnings, t.pageViews) };
}

export function totals(rows: DailyRow[]): Totals {
  const sum = { earnings: 0, pageViews: 0, clicks: 0, impressions: 0 };
  for (const row of rows) {
    sum.earnings += row.earnings;
    sum.pageViews += row.page_views;
    sum.clicks += row.clicks;
    sum.impressions += row.impressions;
  }
  return finish(sum);
}

/// Earnings per day for every day in start..=end, zero where there were no rows.
export function byDay(rows: DailyRow[], start: string, end: string): { day: string; earnings: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    sums.set(row.day, (sums.get(row.day) ?? 0) + row.earnings);
  }
  const out: { day: string; earnings: number }[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const day = iso(cursor);
    out.push({ day, earnings: sums.get(day) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function groupBy(rows: DailyRow[], key: (row: DailyRow) => string): Named[] {
  const groups = new Map<string, Omit<Totals, "rpm">>();
  for (const row of rows) {
    const name = key(row);
    const g = groups.get(name) ?? { earnings: 0, pageViews: 0, clicks: 0, impressions: 0 };
    g.earnings += row.earnings;
    g.pageViews += row.page_views;
    g.clicks += row.clicks;
    g.impressions += row.impressions;
    groups.set(name, g);
  }
  return [...groups.entries()]
    .map(([name, g]) => ({ name, ...finish(g) }))
    .sort((a, b) => b.earnings - a.earnings);
}

export function topN(rows: DailyRow[], n: number): Named[] {
  return groupBy(rows, (row) => row.name).slice(0, n);
}

/// The host of a PAGE_URL value. AdSense may omit the scheme.
export function domainOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

export function bySiteOfPage(rows: DailyRow[]): Named[] {
  return groupBy(rows, (row) => domainOf(row.name));
}
