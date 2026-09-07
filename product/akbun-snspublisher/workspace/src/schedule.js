/**
 * Pure helpers for the queue and the calendar. No DOM so node --test runs them as-is.
 * @typedef {{ id: string, body: string, scheduledAt: string | null, channels: Record<string, string> }} Post
 */

export const statuses = ['draft', 'scheduled', 'publishing', 'published', 'failed'];

/**
 * Queue order: scheduled posts first by time, drafts without a time last by id.
 * @param {Post[]} posts
 */
export function queueOrder(posts) {
  return [...posts].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * The single status the queue shows for a post: the worst channel state wins.
 * @param {Post} post
 */
export function overallStatus(post) {
  const values = Object.values(post.channels);
  if (!values.length) return 'draft';
  for (const status of ['failed', 'publishing', 'scheduled', 'draft']) {
    if (values.includes(status)) return status;
  }
  return 'published';
}

/**
 * Local calendar day key for a UTC timestamp. Times are stored in UTC and only shown in local time.
 * @param {string} iso
 * @param {string} [timeZone]
 */
export function dayKey(iso, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso));
  const get = (/** @type {string} */ type) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Six-week grid for a month, Monday first. Each cell carries the posts scheduled that day.
 * @param {number} year
 * @param {number} month 1-12
 * @param {Post[]} posts
 * @param {string} [timeZone]
 */
export function monthGrid(year, month, posts, timeZone) {
  const byDay = new Map();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const key = dayKey(post.scheduledAt, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), post]);
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, 1 - offset));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { key, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1, posts: byDay.get(key) ?? [] };
  });
}
