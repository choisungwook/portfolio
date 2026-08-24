'use strict';

// Everything the model is told about the deck before it answers.
//
// The old prompt handed over JSON.stringify(slide) and nothing else: no origin,
// no units, no z-order, no idea which rectangle was behind which. A model given
// only that cannot say whether two boxes overlap without doing arithmetic it was
// never asked to do, so it guessed, and the guesses were the "it does not
// recognise the slide" complaint. The digest below does that arithmetic in
// JavaScript, where it is exact, and hands over the conclusions.
(function registerAiPrompt(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(require('../editor.js'), require('./styles.js'))
    : factory(root.slidesLib, root.makepresentationAiStyles);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationAiPrompt = api;
})(globalThis, function createAiPrompt(L, Styles) {

// Chips are modifiers, not macros: clicking one leaves the textarea alone and
// only shows up in the assembled prompt at send time. That way a chip can stay
// on across several turns, which is how "draw it, then tidy it, then tidy it
// again" actually gets used.
const QUICK_CHIPS = Object.freeze([
  {
    id: 'arch-draw',
    mode: 'slide',
    label: 'IT 아키텍처 그리기',
    title: 'Draw the requested system as an architecture diagram on the selected slide',
    usesDiagramStyle: true,
    instructions: [
      'Draw the requested system as an IT architecture diagram.',
      'Every component is a rect with its name as the shape text. Never leave a box unlabelled.',
      'Show data flow with arrow shapes. An arrow starts on the edge of its source box and ends on the edge of its target box, never inside one.',
      'Group related components by position, not by drawing decoration around them, unless the layout rules say otherwise.',
      'Keep the number of boxes at or under 9. Merge detail into a label rather than adding a tenth box.',
      'Label every arrow that carries a protocol or a payload with a small text shape near its midpoint.',
      'Leave the existing shapes alone unless the request says to replace them. If the slide already holds a diagram, extend it instead of drawing a second one on top.',
    ],
  },
  {
    id: 'arch-polish',
    mode: 'slide',
    label: '아키텍처 다듬기',
    title: 'Align, space and recolour what is already on the slide without changing its meaning',
    usesDiagramStyle: true,
    instructions: [
      'Do not change what the slide says. Add no new components and remove none.',
      'Fix geometry only: snap edges into alignment, equalise gaps, give sibling boxes one common size, and pull every shape fully inside the canvas.',
      'Resolve every overlap listed in the digest unless the shapes are meant to be stacked.',
      'Re-colour shapes to the palette below so the slide uses one colour system.',
      'Reattach arrows so each one touches the edge of its source and target box.',
      'Collapse font sizes to at most three distinct values across the slide.',
      'Prefer update operations. Use add only for a label that is plainly missing, and remove only for a shape with no size and no text.',
    ],
  },
  {
    id: 'text-polish',
    mode: 'text',
    label: '문구 다듬기',
    title: 'Rewrite the slide wording so it reads well on a projector',
    instructions: [
      'Rewrite the slide wording so it works on a projector: short lines, one idea per line, parallel grammar.',
      'Keep the language the user wrote in and keep every technical term exactly as written.',
      'Return the rewritten text for each shape, labelled with the shape index it belongs to. Do not return JSON.',
    ],
  },
  {
    id: 'text-summarize',
    mode: 'text',
    label: '핵심 요약',
    title: 'Reduce the slide to its headline and three supporting points',
    instructions: [
      'Reduce the slide to one headline and at most three supporting points.',
      'Cut anything the speaker would say out loud rather than show.',
      'Keep the language the user wrote in. Return plain text, not JSON.',
    ],
  },
  {
    id: 'style-webtoon',
    mode: 'image',
    label: '웹툰',
    title: 'Korean webtoon style',
    instructions: ['Draw it in Korean webtoon style: clean bold linework, flat cel shading, expressive faces, light halftone texture.'],
  },
  {
    id: 'style-watercolor',
    mode: 'image',
    label: '수채화',
    title: 'Watercolour style',
    instructions: ['Paint it as a watercolour: soft wet-on-wet washes, visible paper grain, blurred edges, a restrained palette.'],
  },
  {
    id: 'style-flat',
    mode: 'image',
    label: '플랫 일러스트',
    title: 'Flat vector illustration',
    instructions: ['Draw it as a flat vector illustration: solid fills, no gradients, no outlines, generous negative space, a palette of four colours.'],
  },
  {
    id: 'style-3d',
    mode: 'image',
    label: '3D 렌더',
    title: '3D render',
    instructions: ['Render it in 3D: soft studio lighting, matte materials, gentle depth of field, a plain seamless backdrop.'],
  },
].map(Object.freeze));

function chipsForMode(mode) {
  return QUICK_CHIPS.filter((chip) => chip.mode === mode);
}

function chip(id) {
  return QUICK_CHIPS.find((item) => item.id === id) || null;
}

function selectedChips(mode, ids) {
  const wanted = new Set(Array.isArray(ids) ? ids : []);
  return chipsForMode(mode).filter((item) => wanted.has(item.id));
}

function usesDiagramStyle(mode, ids) {
  return selectedChips(mode, ids).some((item) => item.usesDiagramStyle);
}

// --- reading a slide ---------------------------------------------------------------------------

function round(value) {
  return Math.round(Number(value) || 0);
}

function quote(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > 160 ? `"${value.slice(0, 159)}…"` : `"${value}"`;
}

function box(shape) {
  const bounds = L.visualShapeBBox(shape);
  return {
    x: round(bounds.x),
    y: round(bounds.y),
    w: round(bounds.w),
    h: round(bounds.h),
    right: round(bounds.x + bounds.w),
    bottom: round(bounds.y + bounds.h),
    cx: round(bounds.x + bounds.w / 2),
    cy: round(bounds.y + bounds.h / 2),
  };
}

function styleLine(shape) {
  const parts = [];
  if (shape.stroke && shape.stroke !== 'none') {
    parts.push(`stroke ${shape.stroke} ${round(shape.strokeWidth)}px ${shape.dash || 'solid'}`);
  } else {
    parts.push('no stroke');
  }
  parts.push(shape.fill && shape.fill !== 'none' ? `fill ${shape.fill}` : 'fill none');
  if (shape.rotation) parts.push(`rotated ${round(shape.rotation)}°`);
  return parts.join(', ');
}

function textLine(shape) {
  if (!shape.text) return '';
  const style = [
    `${round(shape.fontSize)}px`,
    shape.fontFamily,
    shape.textColor,
    `${shape.textAlign}/${shape.verticalAlign}`,
  ];
  if (shape.bold) style.push('bold');
  if (shape.italic) style.push('italic');
  if (shape.underline) style.push('underline');
  return `text ${quote(shape.text)} · ${style.join(' ')}`;
}

function shapeLines(shape, index) {
  const b = box(shape);
  const head = `[${index}] ${shape.kind}`;
  const lines = [];
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    const x2 = round(shape.x + shape.w);
    const y2 = round(shape.y + shape.h);
    const direction = Math.abs(round(shape.h)) <= 2
      ? 'horizontal'
      : Math.abs(round(shape.w)) <= 2 ? 'vertical' : 'diagonal';
    lines.push(`${head} from (${round(shape.x)},${round(shape.y)}) to (${x2},${y2}) · ${direction}, length ${round(Math.hypot(shape.w, shape.h))}`);
    lines.push(`     ${styleLine(shape)}, ends ${shape.arrowStart || 'none'}→${shape.arrowEnd || 'none'}`);
  } else if (shape.kind === 'pen') {
    lines.push(`${head} freehand, ${(shape.points || []).length} points, box x ${b.x}–${b.right} y ${b.y}–${b.bottom}`);
    lines.push(`     ${styleLine(shape)}`);
  } else {
    lines.push(`${head} x ${b.x}–${b.right} (w ${b.w}) y ${b.y}–${b.bottom} (h ${b.h}) centre (${b.cx},${b.cy})`);
    lines.push(`     ${styleLine(shape)}`);
  }
  if (shape.kind === 'image') {
    lines.push('     picture supplied by the user. The app keeps the pixels; only x, y, w, h and the border may be changed.');
  }
  if (shape.kind === 'code') {
    const count = String(shape.text || '').split('\n').length;
    lines.push(`     code block, ${shape.codeLanguage || 'plain'}, ${count} lines, theme ${shape.codeFormat || 'default'}`);
  } else {
    const text = textLine(shape);
    if (text) lines.push(`     ${text}`);
  }
  return lines;
}

function overlaps(first, second) {
  const width = Math.min(first.right, second.right) - Math.max(first.x, second.x);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y);
  if (width <= 1 || height <= 1) return 0;
  const smallest = Math.max(1, Math.min(first.w * first.h, second.w * second.h));
  return Math.round((width * height * 100) / smallest);
}

// Overlaps, strays and near-misses are the findings a tidy-up request is
// actually about, and they are the ones a model reading raw coordinates gets
// wrong most often. Computing them here turns "look at the numbers and judge"
// into "fix this list".
function findings(shapes, size) {
  const boxes = shapes.map(box);
  const notes = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const percent = overlaps(boxes[i], boxes[j]);
      if (percent >= 8) notes.push(`shapes ${i} and ${j} overlap by about ${percent}% of the smaller one`);
    }
  }
  boxes.forEach((item, index) => {
    if (item.x < 0 || item.y < 0 || item.right > size.width || item.bottom > size.height) {
      notes.push(`shape ${index} runs outside the canvas (x ${item.x}–${item.right}, y ${item.y}–${item.bottom})`);
    }
  });
  for (const [edge, read] of [['left', (item) => item.x], ['top', (item) => item.y], ['right', (item) => item.right], ['bottom', (item) => item.bottom]]) {
    const groups = new Map();
    boxes.forEach((item, index) => {
      const value = read(item);
      const key = [...groups.keys()].find((candidate) => Math.abs(candidate - value) <= 12);
      if (key === undefined) groups.set(value, [index]);
      else groups.get(key).push(index);
    });
    for (const [value, members] of groups) {
      const exact = members.every((index) => read(boxes[index]) === value);
      if (members.length >= 2 && !exact) {
        notes.push(`shapes ${members.join(', ')} are within 12px of a shared ${edge} edge but not aligned to it`);
      }
    }
  }
  const sizes = new Map();
  boxes.forEach((item, index) => {
    if (!item.w || !item.h) return;
    const key = [...sizes.keys()].find(([w, h]) => Math.abs(w - item.w) <= 16 && Math.abs(h - item.h) <= 16);
    if (!key) sizes.set([item.w, item.h], [index]);
    else sizes.get(key).push(index);
  });
  for (const [[w, h], members] of sizes) {
    const exact = members.every((index) => boxes[index].w === w && boxes[index].h === h);
    if (members.length >= 2 && !exact) {
      notes.push(`shapes ${members.join(', ')} are nearly the same size but not identical`);
    }
  }
  const fontSizes = [...new Set(shapes.filter((shape) => shape.text).map((shape) => round(shape.fontSize)))];
  if (fontSizes.length > 3) {
    notes.push(`${fontSizes.length} different font sizes are in use (${fontSizes.sort((a, b) => b - a).join(', ')})`);
  }
  return notes.slice(0, 40);
}

function zoneLines(size, geometry) {
  if (!geometry || !Number.isFinite(geometry.contentHeight)) return [];
  return [
    `Title zone: x ${round(geometry.x)}–${round(geometry.x + geometry.width)}, y ${round(geometry.titleY)}–${round(geometry.titleY + geometry.titleHeight)}`,
    `Content zone: x ${round(geometry.x)}–${round(geometry.x + geometry.width)}, y ${round(geometry.contentY)}–${round(geometry.contentY + geometry.contentHeight)}`,
  ];
}

function slideDigest(slide, options = {}) {
  const size = {
    width: round(options.size?.width) || L.SLIDE_W,
    height: round(options.size?.height) || L.SLIDE_H,
  };
  const shapes = Array.isArray(slide?.shapes) ? slide.shapes : [];
  const header = [
    `Slide ${options.slideNumber || 1}${options.slideCount ? ` of ${options.slideCount}` : ''}.`,
    `Canvas ${size.width}x${size.height} px. Origin (0,0) is the top-left corner; x grows right, y grows down. All numbers below are pixels on this canvas.`,
    `Slide background: ${slide?.background || L.DEFAULT_BACKGROUND}`,
    ...zoneLines(size, options.geometry),
  ];
  if (!shapes.length) {
    return [...header, '', 'The slide is empty. There are no shapes and no indices to update.'].join('\n');
  }
  const body = [
    '',
    `${shapes.length} shape${shapes.length === 1 ? '' : 's'}, listed back to front. The number in brackets is the index to use in update and remove operations, and is also the z-order: a later index draws on top of an earlier one.`,
    ...shapes.flatMap((shape, index) => shapeLines(shape, index)),
  ];
  const notes = findings(shapes, size);
  const tail = notes.length
    ? ['', 'Measured issues on this slide:', ...notes.map((note) => `- ${note}`)]
    : ['', 'Measured issues on this slide: none found.'];
  return [...header, ...body, ...tail].join('\n');
}

// --- assembling a turn -------------------------------------------------------------------------

const MODE_RULES = Object.freeze({
  text: [
    'TEXT MODE. Answer in prose or lists. Return no JSON, call no tool, generate no image.',
  ],
  image: [
    'IMAGE MODE. Generate exactly one image with the built-in image generation tool, then stop.',
    'Do not describe the image in words instead of generating it.',
  ],
  slide: [
    'SLIDE MODE. Return only the JSON object the output schema describes. No prose, no code fence, no explanation outside the summary field.',
    'Indices are zero-based and refer to the shape list in the slide reading below.',
    'update changes only the fields you name; set every field you are not changing to null.',
    'add appends a new shape. Set fields the kind does not use to null, but always give kind, x, y, w and h. Only a pen shape needs points.',
    'You cannot add an image shape. An existing image can be moved and resized with update.',
    'For a line or an arrow, x and y are the start point and w and h are the offset to the end point, so they may be negative.',
    'Set background only when the slide background should change; otherwise null.',
    'Write summary as one sentence in the language of the request.',
  ],
});

function diagramStyleLines(styleOptions, size, geometry) {
  const zone = Styles.diagramZone(size, geometry);
  return [
    '',
    'Diagram style, applied to every shape you add or change:',
    ...Styles.layoutLines(Styles.layout(styleOptions?.layout), zone),
    ...Styles.paletteLines(Styles.palette(styleOptions?.palette)),
    `Keep every shape inside x ${zone.x}–${zone.x + zone.width}, y ${zone.y}–${zone.y + zone.height}.`,
    'Round every coordinate to a whole number. Use at most three font sizes: heading, body, caption.',
  ];
}

// The one place a turn's text is built, so the model never receives a mode
// label without the rules for that mode, or a chip without the slide it is
// meant to act on.
function composeTurn(options = {}) {
  const mode = ['text', 'image', 'slide'].includes(options.mode) ? options.mode : 'text';
  const chips = selectedChips(mode, options.chipIds);
  const request = String(options.prompt || '').trim();
  const sections = [...MODE_RULES[mode]];

  if (chips.length) {
    sections.push('', 'Active request modifiers:', ...chips.flatMap((item) => item.instructions.map((line) => `- ${line}`)));
  }
  if (mode !== 'image' && options.slide) {
    sections.push('', 'Current slide reading:', slideDigest(options.slide, options));
  }
  if (mode === 'slide' && (chips.some((item) => item.usesDiagramStyle) || options.forceDiagramStyle)) {
    sections.push(...diagramStyleLines(options.style, options.size, options.geometry));
  }
  if (mode === 'slide' && options.hasSlideImage) {
    sections.push('', 'A rendered picture of this slide is attached. Trust the picture for how it looks and the reading above for exact numbers.');
  }
  sections.push('', `User request: ${request || '(no extra instruction; apply the modifiers above)'}`);
  const text = sections.join('\n');
  return mode === 'image' ? `$imagegen ${text}` : text;
}

// A rejected patch is worth one more turn, but only if the retry says what was
// wrong. Sending the same prompt again just buys the same answer.
function retryTurn(previousText, reason) {
  return [
    'Your previous SLIDE MODE answer could not be applied.',
    `Reason: ${reason}`,
    'Send the corrected JSON object only. Same schema, same slide, same intent.',
    'Check before answering: every index is inside the shape list, every unchanged field in changes is null, every added shape has kind, x, y, w and h, and every colour is either "none" or a #rrggbb value.',
    '',
    previousText,
  ].join('\n');
}

return {
  QUICK_CHIPS,
  MODE_RULES,
  chip,
  chipsForMode,
  selectedChips,
  usesDiagramStyle,
  slideDigest,
  composeTurn,
  retryTurn,
};
});
