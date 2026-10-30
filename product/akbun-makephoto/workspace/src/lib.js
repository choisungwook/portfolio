'use strict';

// Pure page logic: undo history, crop math, filtering and formatting. Loaded
// as a <script> on the page and through require() in node tests, and kept
// behind the one global name makephotoLib.

(function () {
  function editsEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** Undo history for one photo's edit. */
  function createHistory(initial) {
    let past = [];
    let future = [];
    let current = initial;
    return {
      get current() { return current; },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
      /** Record a finished change; a change to the same value is not a step. */
      push(edit) {
        if (editsEqual(edit, current)) return false;
        past.push(current);
        if (past.length > 200) past.shift();
        future = [];
        current = edit;
        return true;
      },
      undo() {
        if (!past.length) return null;
        future.push(current);
        current = past.pop();
        return current;
      },
      redo() {
        if (!future.length) return null;
        past.push(current);
        current = future.pop();
        return current;
      },
      /** Start over from an edit that changed elsewhere, such as the CLI. */
      reset(edit) {
        past = [];
        future = [];
        current = edit;
      },
    };
  }

  const MIN_CROP = 0.05;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /**
   * The largest centered crop with a pixel aspect ratio of `aspect` inside a
   * frame whose own aspect is `frameAspect`. Null aspect means the whole frame.
   */
  function aspectRect(aspect, frameAspect) {
    if (!aspect) return { x: 0, y: 0, w: 1, h: 1 };
    const ratio = aspect / frameAspect; // width/height in normalized units
    const w = ratio >= 1 ? 1 : ratio;
    const h = ratio >= 1 ? 1 / ratio : 1;
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }

  function moveRect(rect, dx, dy) {
    return {
      x: clamp(rect.x + dx, 0, 1 - rect.w),
      y: clamp(rect.y + dy, 0, 1 - rect.h),
      w: rect.w,
      h: rect.h,
    };
  }

  /**
   * Drag a corner. `ratio` is the locked normalized width/height, or null for
   * free. The opposite corner stays put.
   */
  function resizeRect(rect, handle, dx, dy, ratio) {
    const left = handle.includes('w');
    const top = handle.includes('n');
    const ax = left ? rect.x + rect.w : rect.x; // anchor corner
    const ay = top ? rect.y + rect.h : rect.y;
    const room = { x: left ? ax : 1 - ax, y: top ? ay : 1 - ay };
    let w = clamp(rect.w + (left ? -dx : dx), MIN_CROP, room.x);
    let h = clamp(rect.h + (top ? -dy : dy), MIN_CROP, room.y);
    if (ratio) {
      h = w / ratio;
      if (h > room.y) { h = room.y; w = h * ratio; }
      if (h < MIN_CROP) { h = MIN_CROP; w = Math.min(room.x, h * ratio); }
    }
    return { x: left ? ax - w : ax, y: top ? ay - h : ay, w, h };
  }

  function filterPhotos(photos, filter) {
    const search = (filter.search || '').trim().toLowerCase();
    return photos.filter((p) => {
      if (filter.folder && !(p.path === filter.folder || p.path.startsWith(filter.folder + '/'))) return false;
      if (filter.tag && !p.tags.includes(filter.tag)) return false;
      if (filter.minRating && p.rating < filter.minRating) return false;
      if (filter.edited && isDefaultEdit(p.edit)) return false;
      if (search && !p.name.toLowerCase().includes(search) && !p.tags.some((t) => t.toLowerCase().includes(search))) return false;
      return true;
    });
  }

  const DEFAULT_EDIT = {
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, warmth: 0, tint: 0,
    vibrance: 0, saturation: 0, straighten: 0, rotate: 0, crop: null, look: null, look_amount: 100,
  };

  function isDefaultEdit(edit) {
    return Object.keys(DEFAULT_EDIT).every((k) => editsEqual(edit[k] ?? null, DEFAULT_EDIT[k]));
  }

  /** The last two parts of a path, which is what tells folders apart. */
  function shortPath(path) {
    const parts = path.split('/').filter(Boolean);
    return parts.slice(-2).join('/') || '/';
  }

  function formatValue(name, value) {
    const v = Number(value) || 0;
    const sign = v > 0 ? '+' : '';
    if (name === 'exposure') return `${sign}${v.toFixed(2)}`;
    if (name === 'straighten') return `${sign}${v.toFixed(1)}°`;
    if (name === 'look_amount') return `${Math.round(v)}%`;
    return `${sign}${Math.round(v)}`;
  }

  // What each auto button may change, with the names the panel shows.
  const AUTO = {
    straighten: ['Level', { straighten: 'Straighten' }],
    color: ['Color', { warmth: 'Warmth', tint: 'Tint' }],
    brightness: ['Brightness', { exposure: 'Brightness' }],
    light: ['Light & Shadow', { highlights: 'Bright areas', shadows: 'Dark areas' }],
    contrast: ['Contrast', { contrast: 'Contrast' }],
    vivid: ['Vivid', { vibrance: 'Vibrance' }],
  };

  /**
   * One plain line per auto button: the sliders it moved and their new
   * values, or that the photo did not need it. `changed` lists the moved
   * slider names so the panel can point at them.
   */
  function describeAuto(kinds, before, after) {
    const lines = [];
    const changed = [];
    for (const kind of kinds) {
      const [label, fields] = AUTO[kind] || [kind, {}];
      const names = Object.keys(fields);
      const values = (list) => list.map((f) => `${fields[f]} ${formatValue(f, after[f])}`).join(', ');
      const moved = names.filter((f) => (before[f] ?? 0) !== (after[f] ?? 0));
      changed.push(...moved);
      if (moved.length) {
        lines.push(`${label}: ${values(moved)}`);
      } else if (names.some((f) => (after[f] ?? 0) !== 0)) {
        // Measured again and landed on the value it already had.
        lines.push(`${label}: unchanged, ${values(names)}`);
      } else if (kind === 'straighten') {
        lines.push('Level: no clear horizon or vertical line, left as is');
      } else {
        lines.push(`${label}: already fine, nothing changed`);
      }
    }
    return { lines, changed };
  }

  /** Tags on every one of `photos`, and tags on only some of them. */
  function commonTags(photos) {
    const counts = new Map();
    for (const p of photos) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
    const all = [];
    const some = [];
    for (const [tag, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
      (n === photos.length ? all : some).push(tag);
    }
    return { all, some };
  }

  /** Click selection with Cmd (toggle) and Shift (range) like Finder. */
  function nextSelection(selection, order, id, { toggle, range, anchor }) {
    if (range && anchor != null && order.includes(anchor)) {
      const a = order.indexOf(anchor);
      const b = order.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      return new Set(order.slice(lo, hi + 1));
    }
    if (toggle) {
      const next = new Set(selection);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }
    return new Set([id]);
  }

  const exported = {
    editsEqual, createHistory, aspectRect, moveRect, resizeRect, filterPhotos,
    isDefaultEdit, DEFAULT_EDIT, shortPath, formatValue, commonTags, nextSelection, describeAuto,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.makephotoLib = exported;
  }
})();
