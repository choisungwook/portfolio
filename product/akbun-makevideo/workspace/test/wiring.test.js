'use strict';

// renderer-wiring.js takes its dependencies by name from one object that
// renderer.js builds. A name taken but never passed is undefined until the
// page calls it, which stopped the whole UI from initializing once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const names = (text) => new Set(text.split(',').map((part) => part.trim().split(/[\s:(]/)[0]).filter(Boolean));

test('renderer.js passes every dependency renderer-wiring.js takes', () => {
  const taken = names(read('renderer-wiring.js').match(/function createRendererWiring\(deps\) \{\s*const \{([^}]*)\} = deps;/)[1]);
  const passed = names(read('renderer.js').match(/createRendererWiring\(\{([^}]*)\}\);/)[1]);
  const missing = [...taken].filter((name) => !passed.has(name));
  assert.deepEqual(missing, []);
});
