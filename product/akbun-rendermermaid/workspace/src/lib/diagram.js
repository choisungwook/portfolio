// Pure helpers shared by the page and the tests. Nothing here touches the DOM,
// so `node --test` runs them without a browser.

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.25;

// Browsers refuse to allocate a canvas beyond a few thousand pixels per side.
// 8192 is the smallest limit still in the field, so exports stay under it.
export const MAX_CANVAS_EDGE = 8192;

const DEFAULT_SIZE = { width: 800, height: 600 };

/**
 * Reads the intrinsic pixel size of a rendered SVG.
 * Mermaid emits `width="100%"`, so the viewBox is the only reliable source and
 * the width/height attributes are a fallback for hand written SVG.
 */
export function readSvgSize(markup) {
  const openTag = markup.match(/<svg\b[^>]*>/i);
  if (!openTag) return { ...DEFAULT_SIZE };

  const viewBox = openTag[0].match(/viewBox\s*=\s*"([^"]*)"/i);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = pixelAttribute(openTag[0], 'width');
  const height = pixelAttribute(openTag[0], 'height');
  if (width && height) return { width, height };

  return { ...DEFAULT_SIZE };
}

function pixelAttribute(tag, name) {
  const found = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  if (!found) return null;
  const value = Number.parseFloat(found[1]);
  return Number.isFinite(value) && value > 0 && !found[1].includes('%') ? value : null;
}

/**
 * Pins the SVG to a pixel size so a canvas rasterizes it at that size.
 * The `max-width` mermaid leaves in the style attribute would otherwise clamp
 * the image back down and the PNG would come out smaller than asked for.
 */
export function withExplicitSize(markup, width, height) {
  const openTag = markup.match(/<svg\b[^>]*>/i);
  if (!openTag) return markup;

  let tag = openTag[0]
    .replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '')
    .replace(/style\s*=\s*"([^"]*)"/i, (whole, css) => {
      const kept = css
        .split(';')
        .filter((rule) => rule.trim() && !/^\s*max-(width|height)\s*:/i.test(rule))
        .join(';');
      return kept.trim() ? `style="${kept}"` : '';
    });

  tag = tag.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  return markup.replace(openTag[0], tag);
}

/**
 * Picks the export scale, lowered when the requested one would overflow the
 * canvas limit. Returns 1 or more so a huge diagram still exports.
 */
export function exportScale(width, height, requested = 2, maxEdge = MAX_CANVAS_EDGE) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return requested;
  if (longest * requested <= maxEdge) return requested;
  return Math.max(1, Math.min(requested, maxEdge / longest));
}

export function clampZoom(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * Zoom that fills the viewport with the diagram, enlarging a small one as
 * readily as it shrinks a large one. SVG scales without losing quality, and a
 * large view that leaves a small diagram at its original size is not large.
 */
export function fitZoom(viewportWidth, viewportHeight, diagramWidth, diagramHeight, padding = 48) {
  if (diagramWidth <= 0 || diagramHeight <= 0) return 1;
  const usableWidth = Math.max(1, viewportWidth - padding * 2);
  const usableHeight = Math.max(1, viewportHeight - padding * 2);
  return clampZoom(Math.min(usableWidth / diagramWidth, usableHeight / diagramHeight));
}

/**
 * One zoom step away from the current value. `direction` is positive to zoom
 * in and negative to zoom out, so a button and a wheel share one code path.
 */
export function stepZoom(current, direction, step = ZOOM_STEP) {
  const base = Number.isFinite(current) && current > 0 ? current : 1;
  return clampZoom(direction >= 0 ? base * step : base / step);
}

/**
 * Zoom that fits the diagram in the pane but never enlarges it past its
 * natural size. The preview is the place you read the code next to, so a small
 * diagram blown up to fill the pane would only lie about its real size. The
 * large view is where `fitZoom` scales up.
 */
export function shrinkToFitZoom(viewportWidth, viewportHeight, diagramWidth, diagramHeight, padding = 24) {
  return Math.min(1, fitZoom(viewportWidth, viewportHeight, diagramWidth, diagramHeight, padding));
}

/**
 * Maps a pressed key to a zoom action, or null when the key is not one.
 * `withModifier` is whether Ctrl or Cmd was held; the caller decides whether
 * that is required, because the large view takes the bare keys too.
 */
export function zoomAction(key, withModifier = true) {
  if (!withModifier) return null;
  if (key === '+' || key === '=' || key === 'Add') return 'in';
  if (key === '-' || key === '_' || key === 'Subtract') return 'out';
  if (key === '0') return 'reset';
  return null;
}

/** The message to show for a thrown value, whatever shape it arrived in. */
export function errorText(error) {
  if (error == null) return 'Unknown error.';
  if (typeof error === 'string') return error.trim() || 'Unknown error.';

  const message = typeof error.message === 'string' ? error.message.trim() : '';
  if (message) return message;

  // `String(new Error(''))` is just `Error`, which tells a reader nothing.
  const text = String(error).trim();
  if (!text || text === '[object Object]' || /^\w*Error$/.test(text)) return 'Unknown error.';
  return text;
}

/**
 * Names the diagram from its first meaningful line, skipping blank lines,
 * `%%` comments, `%%{init}%%` directives and a YAML frontmatter block.
 */
export function diagramType(code) {
  const lines = String(code ?? '').split('\n');
  let inFrontmatter = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    if (line.startsWith('%%')) continue;

    const keyword = line.split(/[\s({:]/)[0];
    const slug = keyword.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (slug) return slug;
  }

  return 'diagram';
}

export function isBlank(code) {
  return String(code ?? '').trim().length === 0;
}

/** File name for a saved PNG, e.g. `mermaid-flowchart-20260804-1530.png`. */
export function pngFileName(code, date) {
  const pad = (value) => String(value).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `mermaid-${diagramType(code)}-${stamp}.png`;
}
