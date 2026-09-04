'use strict';

(function () {

const MODIFIERS = {
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  '⌘': 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  shift: 'shift',
  '⇧': 'shift',
  alt: 'alt',
  option: 'alt',
  '⌥': 'alt',
};

const KEY_NAMES = {
  backspace: 'Backspace',
  delete: 'Delete',
  space: 'Space',
  spacebar: 'Space',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  'page up': 'PageUp',
  pagedown: 'PageDown',
  'page down': 'PageDown',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
};

const SHORTCUTS = [
  { action: 'new-project', label: 'New Project', keys: ['Meta+KeyN'] },
  { action: 'open-project', label: 'Open Project', keys: ['Meta+KeyO'] },
  { action: 'save-project', label: 'Save Project', keys: ['Meta+KeyS'] },
  { action: 'save-project-as', label: 'Save Project As', keys: ['Meta+Shift+KeyS'] },
  { action: 'close-project', label: 'Close Project', keys: ['Meta+KeyW'] },
  { action: 'import-assets', label: 'Import Media', keys: ['Meta+KeyI'] },
  { action: 'undo', label: 'Undo', keys: ['Meta+KeyZ'] },
  { action: 'redo', label: 'Redo', keys: ['Meta+Shift+KeyZ'] },
  { action: 'split', label: 'Split at Playhead', keys: ['Meta+KeyB', 'Meta+KeyD'] },
  { action: 'delete-clip', label: 'Delete Clip', keys: ['Backspace', 'Delete'] },
  { action: 'ripple-delete', label: 'Ripple Delete', keys: ['Shift+Backspace', 'Shift+Delete'] },
  { action: 'toggle-playback', label: 'Play or Pause', keys: ['Space'] },
  { action: 'previous-frame', label: 'Previous Frame', keys: ['ArrowLeft'] },
  { action: 'next-frame', label: 'Next Frame', keys: ['ArrowRight'] },
  { action: 'previous-second', label: 'Previous Second', keys: ['Shift+ArrowLeft'] },
  { action: 'next-second', label: 'Next Second', keys: ['Shift+ArrowRight'] },
  { action: 'previous-edit', label: 'Previous Edit', keys: ['ArrowUp', 'PageUp'] },
  { action: 'next-edit', label: 'Next Edit', keys: ['ArrowDown', 'PageDown'] },
  { action: 'timeline-start', label: 'Timeline Start', keys: ['Home'] },
  { action: 'timeline-end', label: 'Timeline End', keys: ['End'] },
  { action: 'monitor-fullscreen', label: 'Program Monitor Full Screen', keys: ['Meta+KeyF'] },
];

function normalizeKey(value) {
  const word = value.trim().toLowerCase();
  if (KEY_NAMES[word]) return KEY_NAMES[word];
  if (/^[a-z]$/.test(word)) return `Key${word.toUpperCase()}`;
  if (/^[0-9]$/.test(word)) return `Digit${word}`;
  if (/^key[a-z]$/i.test(value)) return `Key${value.at(-1).toUpperCase()}`;
  if (/^digit[0-9]$/i.test(value)) return `Digit${value.at(-1)}`;
  return null;
}

function normalizeChord(value) {
  const parts = String(value).split('+').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const modifiers = new Set();
  let key = null;
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    const parsed = normalizeKey(part);
    if (!parsed || key) return null;
    key = parsed;
  }
  if (!key) return null;
  return [
    modifiers.has('ctrl') ? 'Ctrl' : '',
    modifiers.has('alt') ? 'Alt' : '',
    modifiers.has('shift') ? 'Shift' : '',
    modifiers.has('meta') ? 'Meta' : '',
    key,
  ].filter(Boolean).join('+');
}

function parseKeys(value) {
  const keys = String(value).split(',').map(normalizeChord);
  if (!keys.length || keys.some((key) => !key)) return null;
  return [...new Set(keys)];
}

function resolved(overrides) {
  const custom = overrides || {};
  return SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    keys: Array.isArray(custom[shortcut.action]) && custom[shortcut.action].length
      ? custom[shortcut.action]
      : shortcut.keys,
  }));
}

function overridesFor(keysByAction) {
  const next = {};
  for (const shortcut of SHORTCUTS) {
    const keys = keysByAction[shortcut.action] || shortcut.keys;
    if (keys.join(',') !== shortcut.keys.join(',')) next[shortcut.action] = keys;
  }
  return next;
}

function conflicts(shortcuts) {
  const owner = new Map();
  const found = [];
  for (const shortcut of shortcuts) {
    for (const key of shortcut.keys) {
      const other = owner.get(key);
      if (other && other.action !== shortcut.action) {
        found.push({ key, first: other, second: shortcut });
      } else {
        owner.set(key, shortcut);
      }
    }
  }
  return found;
}

function matches(event, chord) {
  const parts = chord.split('+');
  const key = parts.at(-1);
  const has = (name) => parts.includes(name);
  return event.code === key
    && event.metaKey === has('Meta')
    && event.ctrlKey === has('Ctrl')
    && event.altKey === has('Alt')
    && event.shiftKey === has('Shift');
}

function exactActionFor(event, shortcuts) {
  for (const shortcut of shortcuts) {
    if (shortcut.keys.some((key) => matches(event, key))) return shortcut.action;
  }
  return null;
}

function actionFor(event, shortcuts) {
  const action = exactActionFor(event, shortcuts);
  if (action || !event.ctrlKey || event.metaKey) return action;
  return exactActionFor({ ...event, ctrlKey: false, metaKey: true }, shortcuts);
}

function formatChord(chord) {
  const names = {
    Meta: '⌘',
    Ctrl: '⌃',
    Alt: '⌥',
    Shift: '⇧',
    Backspace: '⌫',
    Delete: 'Delete',
    Space: 'Space',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  };
  return chord.split('+').map((part) => {
    if (names[part]) return names[part];
    if (part.startsWith('Key')) return part.slice(3);
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join('');
}

function formatKeys(keys) {
  return keys.map(formatChord).join(' / ');
}

function inputKeys(keys) {
  return keys.map((key) => key.split('+').map((part) => {
    if (part === 'Meta') return 'Cmd';
    if (part === 'Alt') return 'Option';
    if (part.startsWith('Key')) return part.slice(3);
    if (part.startsWith('Digit')) return part.slice(5);
    return part;
  }).join('+')).join(', ');
}

const exported = {
  shortcuts: SHORTCUTS,
  parseKeys,
  resolved,
  overridesFor,
  conflicts,
  actionFor,
  formatKeys,
  inputKeys,
};

if (typeof module !== 'undefined' && module.exports) module.exports = exported;
else globalThis.shortcutLib = exported;

}());
