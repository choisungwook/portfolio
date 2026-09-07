import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyBlocks } from '../src/body.js';

test('Markdown blocks keep HTML and script payloads as literal text', () => {
  const result = bodyBlocks('# 제목\n\n<script>alert(1)</script>\n```js\n<img onerror="attack()">\n```');
  assert.deepEqual(result, [
    { tag: 'h2', text: '제목' }, { tag: 'p', text: '<script>alert(1)</script>' }, { tag: 'pre', text: '<img onerror="attack()">' },
  ]);
});
