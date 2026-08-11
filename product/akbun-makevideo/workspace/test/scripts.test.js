'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('classic page scripts do not leak conflicting declarations', () => {
  const context = vm.createContext({});
  const names = [
    'time.js', 'geometry.js', 'timeline.js', 'shortcuts.js', 'quality.js',
    'preview.js', 'transform.js', 'guides.js', 'monitor.js',
  ];
  for (const name of names) {
    const file = path.join(__dirname, '..', 'src', name);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }

  assert.ok(context.timeLib);
  assert.ok(context.geometryLib);
  assert.ok(context.timelineLib);
  assert.ok(context.shortcutLib);
  assert.ok(context.qualityLib);
  assert.ok(context.previewLib);
  assert.ok(context.monitorLib);
});

// Each of these is loaded with a `<script>` tag and reached through its one
// global. A file left out of index.html is a global that is not there when the
// file needing it runs, which is a TypeError on the first frame and a dead
// page — the whole editor, not the one control that needed it.
test('every library the page loads is a script tag on the page', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const loaded = [...page.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  const sources = fs
    .readdirSync(path.join(__dirname, '..', 'src'))
    .filter((name) => name.endsWith('.js'));

  assert.deepStrictEqual(sources.filter((name) => !loaded.includes(name)), []);
  // Order matters as much as presence: a global is read when the file using it
  // is evaluated, so a dependency loaded after its dependant is not there yet.
  assert.ok(loaded.indexOf('geometry.js') < loaded.indexOf('preview.js'));
  assert.ok(loaded.indexOf('geometry.js') < loaded.indexOf('monitor.js'));
  assert.ok(loaded.indexOf('preview.js') < loaded.indexOf('renderer.js'));
});
