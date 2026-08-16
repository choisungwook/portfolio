(function registerEditorSvg(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(
      require('./constants.js'),
      require('./shapes.js'),
      require('./geometry.js'),
      require('./deck.js')
    )
    : factory(
      root.makepresentationEditorConstants,
      root.makepresentationEditorShapes,
      root.makepresentationEditorGeometry,
      root.makepresentationEditorDeck
    );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorSvg = api;
})(globalThis, function createEditorSvg(C, Shapes, Geometry, Deck) {
  'use strict';

  const {
    ARROW_ENDS,
    CODE_FORMATS,
    CODE_KEYWORDS,
    CODE_LANGUAGES,
    DEFAULT_STYLE,
    SLIDE_H,
    SLIDE_W,
    TEXTUAL,
  } = C;
  const { normalizeLineNumbers } = Shapes;
  const { rotatedBBox, shapeBBox } = Geometry;
  const { slideBackground, slideNumberShape } = Deck;

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function codeCommentMarkers(language) {
  if (['python', 'hcl', 'bash', 'yaml'].includes(language)) return ['#'];
  if (language === 'html') return ['<!--'];
  if (language === 'sql') return ['--'];
  return ['//', '/*'];
}

function tokenizeCodeLine(line, language) {
  const text = String(line || '');
  const keywords = CODE_KEYWORDS[language] || new Set();
  const markers = codeCommentMarkers(language);
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const marker = markers.find((candidate) => text.startsWith(candidate, index));
    if (marker) {
      tokens.push({ text: text.slice(index), type: 'comment' });
      break;
    }
    const char = text[index];
    if (char === '"' || char === "'" || char === '`') {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '\\') end += 2;
        else if (text[end] === char) {
          end += 1;
          break;
        } else end += 1;
      }
      tokens.push({ text: text.slice(index, end), type: 'string' });
      index = end;
      continue;
    }
    const number = text.slice(index).match(/^(?:0x[\da-f]+|\d+(?:\.\d+)?)/i);
    if (number) {
      tokens.push({ text: number[0], type: 'number' });
      index += number[0].length;
      continue;
    }
    const word = text.slice(index).match(/^[A-Za-z_$][\w$-]*/);
    if (word) {
      tokens.push({
        text: word[0],
        type: keywords.has(word[0]) || keywords.has(word[0].toLowerCase())
          ? 'keyword'
          : 'text',
      });
      index += word[0].length;
      continue;
    }
    const type = /[{}()[\].,:;=+*/<>!&|?-]/.test(char) ? 'operator' : 'text';
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === type) previous.text += char;
    else tokens.push({ text: char, type });
    index += 1;
  }
  return tokens;
}

function codeShapeSvg(shape) {
  const box = shapeBBox(shape);
  if (!(box.w > 0) || !(box.h > 0)) return '';
  const theme = CODE_FORMATS[shape.codeFormat] || CODE_FORMATS['editor-dark'];
  const format = CODE_FORMATS[shape.codeFormat] ? shape.codeFormat : 'editor-dark';
  const language = CODE_LANGUAGES.includes(shape.codeLanguage) ? shape.codeLanguage : 'plaintext';
  const fontSize = Math.max(1, Number(shape.fontSize) || 24);
  const lineHeight = fontSize * 1.48;
  const chromeHeight = format === 'minimal' ? 0 : fontSize * 1.8;
  const top = chromeHeight + fontSize * 0.8;
  const lines = String(shape.text || '').replace(/\r/g, '').split('\n');
  const showNumbers = shape.showLineNumbers !== false;
  const digits = String(Math.max(1, lines.length)).length;
  const gutter = showNumbers ? fontSize * (digits * 0.62 + 1.4) : 0;
  const left = fontSize * 1.05 + gutter;
  const right = fontSize * 1.8;
  const highlights = new Set(normalizeLineNumbers(shape.codeHighlights));
  const callouts = normalizeLineNumbers(shape.codeCallouts);
  const calloutNumbers = new Map(callouts.map((line, index) => [line, index + 1]));
  const visible = Math.max(1, Math.floor((box.h - top - fontSize * 0.5) / lineHeight));
  const radius = Math.min(fontSize * 0.75, box.w / 8, box.h / 8);
  const header = format === 'minimal'
    ? ''
    : `<rect width="${box.w}" height="${chromeHeight}" fill="${theme.chrome}"/>` +
      (format === 'terminal'
        ? `<text x="${fontSize}" y="${chromeHeight / 2 + fontSize * 0.34}" font-size="${fontSize * 0.78}" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">›_ ${escapeXml(language)}</text>`
        : `<circle cx="${fontSize}" cy="${chromeHeight / 2}" r="${fontSize * 0.2}" fill="#ff5f57"/><circle cx="${fontSize * 1.7}" cy="${chromeHeight / 2}" r="${fontSize * 0.2}" fill="#febc2e"/><circle cx="${fontSize * 2.4}" cy="${chromeHeight / 2}" r="${fontSize * 0.2}" fill="#28c840"/><text x="${box.w / 2}" y="${chromeHeight / 2 + fontSize * 0.27}" text-anchor="middle" font-size="${fontSize * 0.68}" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${escapeXml(language)}</text>`);
  let body = '';
  for (let index = 0; index < Math.min(lines.length, visible); index += 1) {
    const number = index + 1;
    const baseline = top + index * lineHeight + fontSize;
    if (highlights.has(number)) {
      body += `<rect x="${fontSize * 0.45}" y="${baseline - fontSize * 1.05}" width="${box.w - fontSize * 0.9}" height="${lineHeight}" rx="${fontSize * 0.18}" fill="${theme.highlight}"/>`;
    }
    if (showNumbers) {
      body += `<text x="${left - fontSize * 0.85}" y="${baseline}" text-anchor="end" font-size="${fontSize}" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${number}</text>`;
    }
    const spans = tokenizeCodeLine(lines[index], language).map((token) => {
      const color = theme[token.type] || theme.text;
      return `<tspan fill="${color}">${escapeXml(token.text)}</tspan>`;
    }).join('');
    body += `<text x="${left}" y="${baseline}" font-size="${fontSize}" fill="${theme.text}" xml:space="preserve" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${spans || ' '}</text>`;
    if (calloutNumbers.has(number)) {
      const cx = box.w - right / 2;
      const cy = baseline - fontSize * 0.34;
      const callout = calloutNumbers.get(number);
      body += `<circle cx="${cx}" cy="${cy}" r="${fontSize * 0.52}" fill="${theme.callout}"/><text x="${cx}" y="${cy + fontSize * 0.28}" text-anchor="middle" font-size="${fontSize * 0.72}" font-weight="700" fill="#ffffff" font-family="Arial, sans-serif">${callout}</text>`;
    }
  }
  const overflow = lines.length > visible
    ? `<text x="${box.w - fontSize}" y="${box.h - fontSize * 0.55}" text-anchor="end" font-size="${fontSize * 0.7}" fill="${theme.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">+${lines.length - visible} lines</text>`
    : '';
  const leftCrop = Math.max(0, Math.min(0.95, Number(shape.cropLeft) || 0));
  const topCrop = Math.max(0, Math.min(0.95, Number(shape.cropTop) || 0));
  const width = Math.max(0.05, 1 - leftCrop - Math.max(0, Number(shape.cropRight) || 0));
  const height = Math.max(0.05, 1 - topCrop - Math.max(0, Number(shape.cropBottom) || 0));
  const viewBox = `${box.w * leftCrop} ${box.h * topCrop} ${box.w * width} ${box.h * height}`;
  return rotateSvg(
    shape,
    `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${viewBox}" overflow="hidden"><rect width="${box.w}" height="${box.h}" rx="${radius}" fill="${theme.background}"/>${header}${body}${overflow}</svg>`
  );
}

function dashArray(shape) {
  const w = shape.strokeWidth;
  if (shape.dash === 'dash') return `${w * 3} ${w * 2}`;
  if (shape.dash === 'dot') return `${w} ${w * 2}`;
  return 'none';
}

function strokeAttrs(shape) {
  if (shape.stroke === 'none') return 'stroke="none"';
  return (
    `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"` +
    ` stroke-dasharray="${dashArray(shape)}"`
  );
}

function fontAttr(shape) {
  return `font-family="${escapeXml(shape.fontFamily || DEFAULT_STYLE.fontFamily)}, sans-serif"`;
}

const TEXT_CHAR_WIDTH = 0.52;

function wrapTextLines(text, width, fontSize) {
  if (!(width > 0)) return String(text || '').split('\n');
  const max = Math.max(1, Math.floor(width / Math.max(fontSize * TEXT_CHAR_WIDTH, 1)));
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (word.length > max) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(word.slice(0, max));
        word = word.slice(max);
      }
      if (!word) continue;
      if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= max) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function fitTextBox(shape, text, maxWidth) {
  if (!shape || shape.kind !== 'text') return shape;
  const content = String(text || '');
  const fontSize = Math.max(1, Number(shape.fontSize) || DEFAULT_STYLE.fontSize);
  const available = Number.isFinite(maxWidth)
    ? maxWidth
    : SLIDE_W - Math.max(0, Number(shape.x) || 0);
  const widthLimit = Math.max(1, available);
  const minWidth = Math.min(120, widthLimit);
  const longest = Math.max(1, ...content.split('\n').map((line) => line.length));
  shape.w = Math.min(
    widthLimit,
    Math.max(minWidth, longest * fontSize * TEXT_CHAR_WIDTH + 4)
  );
  const lines = wrapTextLines(content, shape.w, fontSize);
  shape.h = Math.max(fontSize * 1.4, lines.length * fontSize * 1.35);
  return shape;
}

function rotateSvg(shape, markup) {
  if (!shape.rotation) return markup;
  const b = shapeBBox(shape);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return `<g transform="rotate(${shape.rotation} ${cx} ${cy})">${markup}</g>`;
}

// How far the text inside a rect or an ellipse keeps off its outline. A text
// box has no outline to keep off, so it gets none.
const TEXT_PADDING = 8;

// The box a shape lays its own text out in. Same one the overlay textarea
// uses, so glyphs do not jump when editing starts or ends.
function textBox(shape) {
  const b = shapeBBox(shape);
  if (!TEXTUAL.has(shape.kind)) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const pad = Math.min(TEXT_PADDING, b.w / 4, b.h / 4);
  return { x: b.x + pad, y: b.y + pad, w: Math.max(0, b.w - pad * 2), h: Math.max(0, b.h - pad * 2) };
}

// Glyphs for whatever text a shape carries, laid out in `box`. Shared by the
// text box and by the text a rect or an ellipse holds inside its outline, so
// the two wrap, align and anchor the same way.
function shapeTextSvg(shape) {
  if (!String(shape.text || '')) return '';
  const inner = textBox(shape);
  const lines = wrapTextLines(shape.text, inner.w, shape.fontSize);
  const lineHeight = shape.fontSize * 1.3;
  const blockHeight = lines.length * lineHeight;
  let y = inner.y + shape.fontSize;
  if (shape.verticalAlign === 'center') y += Math.max(0, (inner.h - blockHeight) / 2);
  if (shape.verticalAlign === 'bottom') y += Math.max(0, inner.h - blockHeight);
  const align = shape.textAlign || 'left';
  const x = align === 'center'
    ? inner.x + inner.w / 2
    : align === 'right' ? inner.x + inner.w : inner.x;
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : '1.3em'}">${escapeXml(line) || ' '}</tspan>`
    )
    .join('');
  const decoration = shape.underline ? ' text-decoration="underline"' : '';
  return `<text x="${x}" y="${y}" font-size="${shape.fontSize}" fill="${shape.textColor}" text-anchor="${anchor}" font-weight="${shape.bold ? '700' : '400'}" font-style="${shape.italic ? 'italic' : 'normal'}"${decoration} ${fontAttr(shape)}>${spans}</text>`;
}

// Markup for one shape. `options.hideText` suppresses the glyphs while the
// overlay textarea is editing that shape.
function renderShapeSvg(shape, options) {
  const hideText = options && options.hideText;
  switch (shape.kind) {
    case 'rect': {
      const b = shapeBBox(shape);
      const outline = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, outline + (hideText ? '' : shapeTextSvg(shape)));
    }
    case 'ellipse': {
      const b = shapeBBox(shape);
      const outline = `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, outline + (hideText ? '' : shapeTextSvg(shape)));
    }
    case 'line':
    case 'arrow':
      return rotateSvg(shape, arrowSvg(shape));
    case 'pen': {
      const pts = shape.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      return rotateSvg(
        shape,
        `<polyline points="${pts}" fill="none" ${strokeAttrs(shape)} stroke-linecap="round" stroke-linejoin="round"/>${penEndsSvg(shape)}`
      );
    }
    case 'text': {
      if (hideText) return '';
      return rotateSvg(shape, shapeTextSvg(shape));
    }
    case 'image': {
      const src = String(shape.src || '');
      const href = src.startsWith('data:image/') ? escapeXml(src) : '';
      const left = Math.max(0, Math.min(0.999, shape.cropLeft || 0));
      const top = Math.max(0, Math.min(0.999, shape.cropTop || 0));
      const width = Math.max(0.001, 1 - left - Math.max(0, shape.cropRight || 0));
      const height = Math.max(0.001, 1 - top - Math.max(0, shape.cropBottom || 0));
      const markup = `<svg x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" viewBox="${left} ${top} ${width} ${height}" preserveAspectRatio="none" overflow="hidden"><image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${href}"/></svg><rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="none" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, markup);
    }
    case 'code':
      return codeShapeSvg(shape);
    default:
      return '';
  }
}

// Which way a freehand stroke leaves one of its two tips, pointing outward.
// A stroke can end on a run of identical points, and those carry no direction,
// so walk inward until the points differ.
function penTipDirection(points, atEnd) {
  const tip = atEnd ? points[points.length - 1] : points[0];
  const step = atEnd ? -1 : 1;
  for (
    let index = atEnd ? points.length - 2 : 1;
    index >= 0 && index < points.length;
    index += step
  ) {
    const dx = tip[0] - points[index][0];
    const dy = tip[1] - points[index][1];
    const length = Math.hypot(dx, dy);
    if (length) return { x: dx / length, y: dy / length };
  }
  return null;
}

// A freehand stroke names its two ends the same way a line does, so the five
// pptx ends are on offer there too. The shaft is not shortened: a polyline has
// no single axis to shorten along, and the head covers its own last segment.
function penEndsSvg(shape) {
  if (shape.points.length < 2 || shape.stroke === 'none') return '';
  const size = Math.max(10, shape.strokeWidth * 4);
  return [['arrowStart', false], ['arrowEnd', true]]
    .map(([name, atEnd]) => {
      const end = ARROW_ENDS.includes(shape[name]) ? shape[name] : 'none';
      if (end === 'none') return '';
      const direction = penTipDirection(shape.points, atEnd);
      if (!direction) return '';
      const tip = atEnd ? shape.points[shape.points.length - 1] : shape.points[0];
      return arrowEndSvg(end, tip[0], tip[1], direction.x, direction.y, size, shape).markup;
    })
    .join('');
}

// The end a shape draws at a given tip, and how far back along the shaft that
// end reaches. The shaft is shortened by that much so it never pokes out
// through a filled tip.
//
// (ux,uy) points outward, away from the shaft and towards the tip.
function arrowEndSvg(end, x, y, ux, uy, size, shape) {
  const color = shape.stroke === 'none' ? '#1a1a1a' : shape.stroke;
  const back = (distance) => [x - ux * distance, y - uy * distance];
  switch (end) {
    case 'triangle': {
      const [bx, by] = back(size);
      // Widening a shortened head keeps it visible on a stubby arrow, where a
      // head proportional to its own length would be narrower than the shaft
      // it sits on. An unclamped head is already wider, so nothing moves.
      const half = Math.max(size * 0.45, shape.strokeWidth);
      return {
        markup: `<polygon points="${x},${y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}" fill="${color}"/>`,
        inset: size,
      };
    }
    case 'arrow': {
      // Two open barbs. They meet at the tip, so the shaft can run the whole
      // way and nothing has to be shortened.
      const [bx, by] = back(size);
      const half = Math.max(size * 0.5, shape.strokeWidth);
      return {
        markup:
          `<polyline points="${bx - uy * half},${by + ux * half} ${x},${y} ${bx + uy * half},${by - ux * half}"` +
          ` fill="none" stroke="${color}" stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
        inset: 0,
      };
    }
    case 'oval': {
      const r = Math.max(size * 0.35, shape.strokeWidth);
      const [cx, cy] = back(r);
      return {
        markup: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`,
        inset: r * 2,
      };
    }
    case 'diamond': {
      const [cx, cy] = back(size / 2);
      const [bx, by] = back(size);
      const half = Math.max(size * 0.35, shape.strokeWidth);
      return {
        markup: `<polygon points="${x},${y} ${cx - uy * half},${cy + ux * half} ${bx},${by} ${cx + uy * half},${cy - ux * half}" fill="${color}"/>`,
        inset: size,
      };
    }
    default:
      return { markup: '', inset: 0 };
  }
}

// One renderer for line and arrow. The two differ only in the end they start
// life with, so a line given an end draws it and an arrow given none stops
// drawing one.
function arrowSvg(shape) {
  const x1 = shape.x, y1 = shape.y;
  const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
  const length = Math.hypot(shape.w, shape.h);
  // A zero length line has no direction to point in. Drawing nothing beats
  // drawing the dot a round cap would leave behind; the handles still select it.
  if (!length) return '';
  const ux = shape.w / length, uy = shape.h / length;
  const start = ARROW_ENDS.includes(shape.arrowStart) ? shape.arrowStart : 'none';
  const end = ARROW_ENDS.includes(shape.arrowEnd) ? shape.arrowEnd : 'none';
  const decorated = (start !== 'none' ? 1 : 0) + (end !== 'none' ? 1 : 0);
  // Never more than half the line for both ends together, so the two bases
  // stay clear of each other. Past that the shaft is drawn backwards and its
  // far end shows up as a stray dot behind the head.
  const size = Math.min(
    length / 2 / Math.max(1, decorated),
    Math.max(10, shape.strokeWidth * 4)
  );
  const head = arrowEndSvg(end, x2, y2, ux, uy, size, shape);
  const tail = arrowEndSvg(start, x1, y1, -ux, -uy, size, shape);
  // A bare line keeps the round cap it always had; a decorated end takes the
  // default butt cap, which stops exactly on the endpoint. Round and square
  // both overshoot by half a stroke, and that overshoot reads as a bead stuck
  // on the end of the arrow.
  const cap = decorated ? '' : ' stroke-linecap="round"';
  return (
    `<line x1="${x1 + ux * tail.inset}" y1="${y1 + uy * tail.inset}"` +
    ` x2="${x2 - ux * head.inset}" y2="${y2 - uy * head.inset}" ${strokeAttrs(shape)}${cap}/>` +
    tail.markup +
    head.markup
  );
}

// A whole slide as standalone SVG markup, used for thumbnails, the
// presentation view, and rasterizing pages for the pdf export.
function renderSlideSvg(slide, options) {
  const width = Number(options && options.width) || SLIDE_W;
  const height = Number(options && options.height) || SLIDE_H;
  let shapes = slide.shapes
    .map((shape, i) =>
      renderShapeSvg(shape, {
        hideText: options && options.hideTextIndex === i,
      })
    )
    .join('');
  if (options && options.number) {
    shapes += renderShapeSvg(slideNumberShape(options.number, width, height));
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${slideBackground(slide)}"/>${shapes}</svg>`
  );
}

function shapeImageBBox(shape) {
  const stroke = shape.stroke === 'none' || shape.kind === 'text' || shape.kind === 'image' || shape.kind === 'code'
    ? 0
    : Math.max(0, shape.strokeWidth || 0) / 2;
  const decorated = shape.kind === 'arrow' ||
    (shape.kind === 'pen' && (shape.arrowStart !== 'none' || shape.arrowEnd !== 'none'));
  const arrow = decorated
    ? Math.max(10, Math.max(0, shape.strokeWidth || 0) * 4) * 0.5
    : 0;
  const padding = Math.max(2, stroke, arrow);
  const box = shapeBBox(shape);
  const padded = {
    x: box.x - padding,
    y: box.y - padding,
    w: Math.max(1, box.w + padding * 2),
    h: Math.max(1, box.h + padding * 2),
  };
  return rotatedBBox(padded, shape.rotation || 0);
}

function renderShapesSvg(shapes) {
  if (!Array.isArray(shapes) || shapes.length === 0) return null;
  const boxes = shapes.map(shapeImageBBox);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const markup = shapes.map((shape) => renderShapeSvg(shape)).join('');
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}">${markup}</svg>`,
    width,
    height,
  };
}

// --- zoom ---------------------------------------------------------------------
//
// Fixed steps rather than a free factor: every stop is a round number the
// label can show, and repeated presses land on the same places every time.
// 1 is the slide fitted to the stage, which is where the editor starts.


  return {
    escapeXml,
    tokenizeCodeLine,
    wrapTextLines,
    fitTextBox,
    rotateSvg,
    textBox,
    renderShapeSvg,
    renderSlideSvg,
    renderShapesSvg,
  };
});
