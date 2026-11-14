'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.tooltipLib = exported;
})(globalThis, function () {
  const SHOW_DELAY_MS = 400;
  const WARM_MS = 300;
  const GAP_PX = 6;
  const EDGE_PX = 4;

  /** Rects are { left, top, right, bottom } in viewport pixels. The tooltip sits
   *  below the target and centered on it, flips above when the bottom edge has no
   *  room, and is pushed back inside the viewport horizontally. */
  function placeTooltip(target, size, viewport) {
    const centered = (target.left + target.right) / 2 - size.width / 2;
    const maxLeft = Math.max(EDGE_PX, viewport.width - size.width - EDGE_PX);
    const left = Math.min(Math.max(centered, EDGE_PX), maxLeft);
    const below = target.bottom + GAP_PX;
    const fitsBelow = below + size.height + EDGE_PX <= viewport.height;
    const above = target.top - GAP_PX - size.height;
    if (fitsBelow || above < EDGE_PX) return { left, top: below, placement: 'below' };
    return { left, top: above, placement: 'above' };
  }

  function createTooltip(deps) {
    const { document, window } = deps;
    let node = null;
    let current = null;
    let suppressed = null;
    let showTimer = 0;
    let warmTimer = 0;
    let warm = false;

    function ensureNode() {
      if (node) return node;
      node = document.createElement('div');
      node.id = 'tooltip';
      node.setAttribute('role', 'tooltip');
      node.hidden = true;
      document.body.appendChild(node);
      return node;
    }

    function tipFor(target) {
      return target && target.closest ? target.closest('[data-tip]') : null;
    }

    function show(target) {
      const text = target.dataset.tip;
      if (!text || !target.isConnected) return;
      const tip = ensureNode();
      tip.textContent = text;
      tip.hidden = false;
      tip.style.left = '0px';
      tip.style.top = '0px';
      const box = target.getBoundingClientRect();
      const size = tip.getBoundingClientRect();
      const place = placeTooltip(
        box,
        { width: size.width, height: size.height },
        { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      );
      tip.style.left = `${Math.round(place.left)}px`;
      tip.style.top = `${Math.round(place.top)}px`;
      current = target;
      warm = true;
      window.clearTimeout(warmTimer);
    }

    function hide() {
      window.clearTimeout(showTimer);
      showTimer = 0;
      if (node) node.hidden = true;
      if (current) {
        window.clearTimeout(warmTimer);
        warmTimer = window.setTimeout(() => { warm = false; }, WARM_MS);
      }
      current = null;
    }

    function schedule(target) {
      window.clearTimeout(showTimer);
      if (warm) show(target);
      else showTimer = window.setTimeout(() => show(target), SHOW_DELAY_MS);
    }

    function wire() {
      document.addEventListener('pointerover', (event) => {
        if (event.pointerType === 'touch') return;
        const target = tipFor(event.target);
        if (!target || target === current) return;
        if (target === suppressed) return;
        suppressed = null;
        hide();
        schedule(target);
      });
      document.addEventListener('pointerout', (event) => {
        const target = tipFor(event.target);
        if (!target) return;
        if (event.relatedTarget && target.contains(event.relatedTarget)) return;
        if (target === suppressed) suppressed = null;
        if (target === current || showTimer) hide();
      });
      document.addEventListener('pointerdown', () => {
        suppressed = current || suppressed;
        hide();
      }, true);
      document.addEventListener('focusin', (event) => {
        const target = tipFor(event.target);
        if (!target || !target.matches(':focus-visible')) return;
        hide();
        show(target);
      });
      document.addEventListener('focusout', hide);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hide();
      });
      document.addEventListener('scroll', hide, true);
      window.addEventListener('blur', hide);
    }

    return { hide, wire };
  }

  return { createTooltip, placeTooltip };
});
