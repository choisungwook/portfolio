'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.keyboardUiLib = exported;
})(globalThis, function () {
  function createKeyboardUi(deps) {
    const {
      K,
      actions,
      closeMenus,
      closeTimelineContextMenu,
      document,
      el,
      exitProgramMonitorFullscreen,
      reportError,
      state,
      window,
    } = deps;

    function shortcutMap() {
      return K.resolved(state.settings.shortcutOverrides);
    }

    function renderShortcutLabels() {
      const byAction = new Map(shortcutMap().map((shortcut) => [shortcut.action, shortcut]));
      for (const node of document.querySelectorAll('[data-shortcut]')) {
        const shortcut = byAction.get(node.dataset.shortcut);
        node.textContent = shortcut ? K.formatKeys(shortcut.keys) : '';
      }
    }

    function fillShortcutSheet() {
      const list = el('shortcut-list');
      list.textContent = '';
      for (const shortcut of shortcutMap()) {
        const row = document.createElement('label');
        row.className = 'shortcut-row';
        row.textContent = shortcut.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.shortcutAction = shortcut.action;
        input.value = K.inputKeys(shortcut.keys);
        input.setAttribute('aria-label', `${shortcut.label} shortcut`);
        row.appendChild(input);
        list.appendChild(row);
      }
      const error = el('shortcut-error');
      error.hidden = true;
      error.textContent = '';
    }

    function collectShortcutOverrides() {
      const keysByAction = {};
      for (const input of el('shortcut-list').querySelectorAll('[data-shortcut-action]')) {
        const keys = K.parseKeys(input.value);
        if (!keys) throw new Error(`Use a key such as Cmd+S for ${input.previousSibling.textContent}.`);
        keysByAction[input.dataset.shortcutAction] = keys;
      }
      const updated = K.resolved(K.overridesFor(keysByAction));
      const conflicts = K.conflicts(updated);
      if (conflicts.length) {
        const conflict = conflicts[0];
        throw new Error(`${K.formatKeys([conflict.key])} is used by ${conflict.first.label} and ${conflict.second.label}.`);
      }
      return K.overridesFor(keysByAction);
    }


    function wireKeyboard() {
      window.addEventListener('keydown', (event) => {
        const target = event.target;
        const typing =
          target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');
        if (event.key === 'Escape' && exitProgramMonitorFullscreen()) {
          event.preventDefault();
          return;
        }
        if (typing) return;
        if (event.key === 'Escape') {
          closeMenus();
          closeTimelineContextMenu();
          for (const sheet of document.querySelectorAll('.overlay')) {
            if (sheet.id !== 'render-overlay' || !state.rendering) sheet.hidden = true;
          }
          return;
        }
        const action = K.actionFor(event, shortcutMap());
        if (!action) return;
        event.preventDefault();
        const run = actions[action];
        if (run) Promise.resolve().then(run).catch((error) => reportError(error, `shortcut:${action}`));
      });
    }


    return {
      collectOverrides: collectShortcutOverrides,
      fillSheet: fillShortcutSheet,
      map: shortcutMap,
      renderLabels: renderShortcutLabels,
      wire: wireKeyboard,
    };
  }

  return { createKeyboardUi };
});
