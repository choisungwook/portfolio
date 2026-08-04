'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('classic page scripts do not leak conflicting declarations', () => {
  const context = vm.createContext({});
  for (const name of ['time.js', 'timeline.js', 'quality.js', 'preview.js']) {
    const file = path.join(__dirname, '..', 'src', name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  assert.ok(context.timeLib);
  assert.ok(context.timelineLib);
  assert.ok(context.qualityLib);
  assert.ok(context.previewLib);
});
