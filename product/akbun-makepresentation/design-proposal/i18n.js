'use strict';

(() => {
  const storageKey = 'akbun-makepresentation.design-proposal.language';
  const messages = globalThis.proposalMessages;
  const sources = new WeakMap();
  const attributeSources = new WeakMap();
  const excluded = 'script, style, svg, textarea, [contenteditable], [data-i18n-dynamic], [data-i18n-skip], #thumbs, #ai-messages, .ai-session-open, #deck-search-results, #font-options, #font-family-label, #settings-presets, .code-preview';
  const excludedAttributes = '[data-i18n-skip], #thumbs, #ai-messages, .ai-session-open, #deck-search-results, #font-options, #settings-presets, .code-preview';
  const aliases = new Map([
    ['문구 다듬기', 'Polish wording'], ['핵심 요약', 'Summarize'],
    ['구조도 그리기', 'Draw architecture'], ['구조도 정돈', 'Tidy architecture'],
    ['IT 아키텍처 그리기', 'Draw architecture'], ['아키텍처 다듬기', 'Tidy architecture'],
    ['플랫 일러스트', 'Flat illustration'], ['3D 렌더', '3D render'],
    ['웹툰', 'Webtoon'], ['수채화', 'Watercolor'], ['플랫', 'Flat'],
  ]);
  let language = 'en';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'en' || saved === 'ko') language = saved;
  } catch {}

  function t(source, values = {}) {
    const slide = /^Slide (\d+)$/.exec(source);
    if (slide) return t('Slide {number}', { number: slide[1] });
    const canonical = aliases.get(source) || source;
    const translated = language === 'ko' ? messages[canonical] || canonical : canonical;
    return translated.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  }

  function translateText(node) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const current = node.textContent;
    if (!current.trim()) return;
    const previous = sources.get(node);
    const original = previous?.last === current ? previous.original : current;
    const key = original.trim().replace(/\s+/g, ' ');
    const translated = t(key);
    const next = original.replace(original.trim(), translated);
    sources.set(node, { original, last: next });
    if (current !== next) node.textContent = next;
  }

  function translateAttributes(element) {
    if (element.closest(excludedAttributes)) return;
    const previous = attributeSources.get(element) || {};
    for (const name of ['title', 'aria-label', 'placeholder']) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const original = previous[name]?.last === current ? previous[name].original : current;
      const next = t(original);
      previous[name] = { original, last: next };
      if (current !== next) element.setAttribute(name, next);
    }
    attributeSources.set(element, previous);
  }

  function apply() {
    observer.disconnect();
    document.documentElement.lang = language;
    for (const option of document.querySelectorAll('option:not([value])')) {
      option.setAttribute('value', option.value);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
    for (const element of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
      translateAttributes(element);
    }
    for (const select of document.querySelectorAll('[data-language-select]')) select.value = language;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
  }

  function selectLanguage(next) {
    if (next !== 'en' && next !== 'ko') return;
    language = next;
    try { localStorage.setItem(storageKey, next); } catch {}
    document.dispatchEvent(new CustomEvent('proposal-language-change'));
    apply();
  }

  const observer = new MutationObserver(apply);
  globalThis.proposalI18n = { t, apply, selectLanguage };
  for (const select of document.querySelectorAll('[data-language-select]')) {
    select.addEventListener('change', () => selectLanguage(select.value));
  }
  apply();
})();
