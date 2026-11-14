'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const shortcuts = require('../src/shortcuts.js');

const sourceDir = path.join(__dirname, '..', 'src');
const read = (name) => fs.readFileSync(path.join(sourceDir, name), 'utf8');
const sourceFiles = (extension) => fs.readdirSync(sourceDir).filter((name) => name.endsWith(extension));

// Read through getComputedStyle with a fallback in renderer-timeline-ui.js; no
// stylesheet defines it, so the fallback colour is what the waveform uses.
const UNDEFINED_VARIABLES_WITH_FALLBACK = new Set(['--waveform']);

// Drawn over the video, so they keep the same colours in both themes
// (designs/README.md, Visual system).
const COLOR_SELECTORS_OVER_VIDEO = new Set([
  '.monitor-stage',
  '#stage',
  '#stage-hint',
  '#stage-mode',
  '#source-hint',
]);

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every rule that holds declarations, with the selector it sits under and
 *  whether an enclosing block is a :root rule. At-rules only nest. */
function rulesOf(css) {
  const rules = [];
  const stack = [];
  let buffer = '';
  for (const char of stripComments(css)) {
    if (char === '{') {
      stack.push({ selector: buffer.trim(), declarations: '' });
      buffer = '';
    } else if (char === ';') {
      if (stack.length) stack[stack.length - 1].declarations += `${buffer};`;
      buffer = '';
    } else if (char === '}') {
      const rule = stack.pop();
      if (rule) {
        rule.declarations += buffer;
        if (!rule.selector.startsWith('@')) rules.push(rule);
      }
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return rules;
}

const COLOR_PROPERTY = /^(color|background(-color)?|border(-[a-z]+)*|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?)$/;
const NAMED_COLORS = [
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown',
  'gray', 'grey', 'silver', 'gold', 'cyan', 'magenta', 'lime', 'maroon', 'navy', 'olive',
  'teal', 'aqua', 'fuchsia', 'coral', 'crimson', 'indigo', 'violet', 'tomato', 'salmon', 'khaki',
];
const NAMED_COLOR = new RegExp(`\\b(${NAMED_COLORS.join('|')})\\b`, 'i');

function declarationsOf(body) {
  return body.split(';').map((declaration) => {
    const colon = declaration.indexOf(':');
    return colon === -1
      ? null
      : { property: declaration.slice(0, colon).trim().toLowerCase(), value: declaration.slice(colon + 1).trim() };
  }).filter(Boolean);
}

/** The first colour written out in a rule body instead of taken from a
 *  variable: a hex value, rgb/hsl, or a named colour in a colour property. */
function literalColor(body) {
  for (const { property, value } of declarationsOf(body)) {
    if (property.startsWith('--')) continue;
    const bare = value.replace(/url\([^)]*\)/g, '').replace(/var\([^)]*\)/g, '');
    const literal = bare.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/);
    if (literal) return literal[0];
    if (COLOR_PROPERTY.test(property)) {
      const named = bare.match(NAMED_COLOR);
      if (named) return named[0];
    }
  }
  return null;
}

function tagsWith(page, attribute) {
  return [...page.matchAll(/<[a-z](?:[^>"]|"[^"]*")*>/gi)]
    .map((match) => match[0])
    .filter((tag) => new RegExp(`\\s${attribute}(=|\\s|>|/)`).test(tag.replace(/"[^"]*"/g, '""')));
}

const attributeOf = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
};

test('every CSS variable the page reads is defined in a stylesheet', () => {
  const css = sourceFiles('.css').map((name) => ({ name, text: stripComments(read(name)) }));
  const defined = new Set(css.flatMap(({ text }) => [...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
  const missing = [];
  for (const { name, text } of css) {
    for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!defined.has(match[1])) missing.push(`${name}: var(${match[1]})`);
    }
  }
  for (const name of sourceFiles('.js')) {
    for (const match of read(name).matchAll(/getPropertyValue\(\s*'(--[\w-]+)'/g)) {
      if (!defined.has(match[1]) && !UNDEFINED_VARIABLES_WITH_FALLBACK.has(match[1])) {
        missing.push(`${name}: getPropertyValue('${match[1]}')`);
      }
    }
  }

  assert.deepStrictEqual(missing, []);
});

test('renamed token names are gone from styles, scripts and the page', () => {
  const retired = [/--dim(?![\w-])/, /--panel-2(?![\w-])/, /--accent-fg(?![\w-])/, /--shadow(?![\w-])/];
  const found = [];
  for (const name of [...sourceFiles('.css'), ...sourceFiles('.js'), 'index.html']) {
    const text = read(name);
    for (const pattern of retired) {
      const match = text.match(pattern);
      if (match) found.push(`${name}: ${match[0]}`);
    }
  }

  assert.deepStrictEqual(found, []);
});

test('rule bodies take colours from variables, except over the video', () => {
  const found = [];
  for (const name of sourceFiles('.css')) {
    for (const rule of rulesOf(read(name))) {
      if (/(^|[\s,])(:root|html)(?![\w-])/.test(rule.selector) && /--[\w-]+\s*:/.test(rule.declarations)) continue;
      const literal = literalColor(rule.declarations) && [literalColor(rule.declarations)];
      if (!literal) continue;
      const selectors = rule.selector.split(',').map((selector) => selector.trim());
      if (selectors.every((selector) => COLOR_SELECTORS_OVER_VIDEO.has(selector))) continue;
      found.push(`${name}: ${rule.selector} uses ${literal[0]}`);
    }
  }

  assert.deepStrictEqual(found, []);
});

test('styles do not transform text case or spacing', () => {
  const found = [];
  for (const name of sourceFiles('.css')) {
    for (const rule of rulesOf(read(name))) {
      for (const { property, value } of declarationsOf(rule.declarations)) {
        const allowed = property === 'text-transform' ? /^none$/i : /^(normal|0(px)?)$/i;
        if ((property === 'text-transform' || property === 'letter-spacing') && !allowed.test(value)) {
          found.push(`${name}: ${rule.selector} sets ${property}: ${value}`);
        }
      }
    }
  }

  assert.deepStrictEqual(found, []);
});

test('the page has no inline style, script or handler, which the CSP refuses', () => {
  const page = read('index.html');
  const inline = tagsWith(page, 'style').map((tag) => `index.html: ${tag}`);
  for (const match of page.matchAll(/<script(?:[^>"]|"[^"]*")*>/gi)) {
    if (!/\ssrc="/.test(match[0])) inline.push(`index.html: inline ${match[0]}`);
  }
  for (const tag of [...page.matchAll(/<[a-z](?:[^>"]|"[^"]*")*>/gi)].map((match) => match[0])) {
    const handler = tag.replace(/"[^"]*"/g, '""').match(/\s(on[a-z]+)=/i);
    if (handler) inline.push(`index.html: ${handler[1]} on ${tag.slice(0, 60)}`);
  }

  assert.deepStrictEqual(inline, []);
});

test('a control with a tooltip has no title and names itself with the same sentence', () => {
  const page = read('index.html');
  const problems = [];
  const tipTags = tagsWith(page, 'data-tip');
  for (const tag of tipTags) {
    const tip = attributeOf(tag, 'data-tip');
    if (/\stitle="/.test(tag)) problems.push(`index.html: title on data-tip="${tip}"`);
    const start = page.indexOf(tag);
    const end = page.indexOf('>', start) + 1;
    const own = attributeOf(tag, 'aria-label');
    const rest = page.slice(end);
    const close = tag.startsWith('<label') ? rest.indexOf('</label>') : rest.indexOf('</button>');
    const inner = close === -1 ? '' : rest.slice(0, close);
    const labelled = [own, ...[...inner.matchAll(/<(?:input|select)[^>]*>/g)].map((m) => attributeOf(m[0], 'aria-label'))];
    if (!labelled.includes(tip)) problems.push(`index.html: data-tip="${tip}" has no aria-label with the same sentence`);
  }
  assert.ok(tipTags.length > 0);
  assert.deepStrictEqual(problems, []);
});

test('data-tip-action names an action that shortcuts.js defines', () => {
  const actions = new Set(shortcuts.resolved({}).map((shortcut) => shortcut.action));
  const unknown = tagsWith(read('index.html'), 'data-tip-action')
    .map((tag) => attributeOf(tag, 'data-tip-action'))
    .filter((action) => !actions.has(action))
    .map((action) => `index.html: data-tip-action="${action}"`);

  assert.deepStrictEqual(unknown, []);
});
