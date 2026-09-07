import test from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, monthGrid, overallStatus, queueOrder } from '../src/schedule.js';

const post = (id, scheduledAt, channels = {}) => ({ id, body: '', scheduledAt, channels });

test('queue puts scheduled posts first by time and undated drafts last by id', () => {
  const order = queueOrder([post('b', null), post('c', '2026-09-09T00:00:00Z'), post('a', null), post('d', '2026-09-08T00:00:00Z')]);
  assert.deepEqual(order.map(item => item.id), ['d', 'c', 'a', 'b']);
});

test('overall status is the worst channel state', () => {
  assert.equal(overallStatus(post('p', null)), 'draft');
  assert.equal(overallStatus(post('p', null, { x: 'published', threads: 'failed' })), 'failed');
  assert.equal(overallStatus(post('p', null, { x: 'published', threads: 'publishing' })), 'publishing');
  assert.equal(overallStatus(post('p', null, { x: 'published', threads: 'published' })), 'published');
});

test('day key follows the display time zone, not UTC', () => {
  assert.equal(dayKey('2026-09-07T20:00:00Z', 'UTC'), '2026-09-07');
  assert.equal(dayKey('2026-09-07T20:00:00Z', 'Asia/Seoul'), '2026-09-08');
});

test('month grid starts on Monday, spans six weeks, and attaches posts to their day', () => {
  const cells = monthGrid(2026, 9, [post('p', '2026-09-07T20:00:00Z'), post('q', null)], 'Asia/Seoul');
  assert.equal(cells.length, 42);
  assert.equal(cells[0].key, '2026-08-31');
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells[1].key, '2026-09-01');
  assert.deepEqual(cells.find(cell => cell.key === '2026-09-08')?.posts.map(item => item.id), ['p']);
  assert.equal(cells.flatMap(cell => cell.posts).length, 1);
});
