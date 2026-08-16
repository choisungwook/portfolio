(function registerEditorConstants(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorConstants = api;
})(globalThis, function createEditorConstants() {
  'use strict';

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const PX_PER_INCH = 96;
const CM_PER_INCH = 2.54;
const MIN_SLIDE_SIZE = 64;
const MAX_SLIDE_SIZE = 10000;
const SLIDE_SIZE_PRESETS = Object.freeze({
  '16:9': Object.freeze({ width: 1920, height: 1080 }),
  '4:3': Object.freeze({ width: 1440, height: 1080 }),
  '3:4': Object.freeze({ width: 1080, height: 1440 }),
  '9:16': Object.freeze({ width: 1080, height: 1920 }),
});

// Paper white. A slide keeps its own background so changing it touches that
// one field and nothing else on the slide.
const DEFAULT_BACKGROUND = '#ffffff';

const DEFAULT_STYLE = {
  stroke: '#e03131',
  strokeWidth: 2,
  dash: 'solid',
  fill: 'none',
  fontSize: 24,
  textColor: '#1a1a1a',
  // One plain family name, not a CSS stack, so it survives a pptx round trip
  // unchanged. A generic fallback is appended at render time. The list on
  // offer lives in the markup of #prop-font-family, which is also where the
  // display labels belong; anything outside it still opens and renders.
  fontFamily: 'Noto Sans KR',
  bold: false,
  italic: false,
  underline: false,
  textAlign: 'left',
  verticalAlign: 'top',
};
const DEFAULT_IMAGE_STYLE = Object.freeze({
  stroke: '#000000',
  strokeWidth: 2,
  dash: 'solid',
});

const BOXY = new Set(['rect', 'ellipse', 'text', 'image', 'code']);
const SHAPE_KINDS = new Set([
  'rect', 'ellipse', 'line', 'arrow', 'pen', 'text', 'image', 'code',
]);

const CODE_FORMATS = Object.freeze({
  'editor-dark': Object.freeze({
    label: 'Editor Dark', background: '#1e1f22', chrome: '#2b2d30', text: '#f8f8f2',
    muted: '#8b949e', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9',
    comment: '#7f8c98', operator: '#8be9fd', highlight: '#343746', callout: '#ff922b',
  }),
  'editor-light': Object.freeze({
    label: 'Editor Light', background: '#ffffff', chrome: '#f1f3f5', text: '#24292f',
    muted: '#8c959f', keyword: '#cf222e', string: '#0a7b3e', number: '#8250df',
    comment: '#6e7781', operator: '#0550ae', highlight: '#fff3bf', callout: '#e8590c',
  }),
  terminal: Object.freeze({
    label: 'Terminal', background: '#111827', chrome: '#1f2937', text: '#e5e7eb',
    muted: '#9ca3af', keyword: '#5eead4', string: '#fde68a', number: '#c4b5fd',
    comment: '#94a3b8', operator: '#7dd3fc', highlight: '#263449', callout: '#fb923c',
  }),
  minimal: Object.freeze({
    label: 'Minimal', background: '#f8f9fa', chrome: '#f8f9fa', text: '#212529',
    muted: '#868e96', keyword: '#c92a2a', string: '#2b8a3e', number: '#6741d9',
    comment: '#868e96', operator: '#1864ab', highlight: '#fff3bf', callout: '#e8590c',
  }),
});

const CODE_LANGUAGES = Object.freeze([
  'plaintext', 'python', 'javascript', 'typescript', 'html', 'css', 'rust', 'hcl',
  'bash', 'json', 'yaml', 'sql', 'java', 'go', 'c', 'cpp', 'kotlin', 'swift',
]);

const CODE_KEYWORDS = Object.freeze({
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(' ')),
  javascript: new Set('async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield'.split(' ')),
  typescript: new Set('abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface keyof let module namespace never new null number object of private protected public readonly return set static string super switch symbol this throw true try type typeof undefined unknown var void while with yield'.split(' ')),
  rust: new Set('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'.split(' ')),
  hcl: new Set('data dynamic for_each locals module output provider resource terraform variable'.split(' ')),
  bash: new Set('case do done elif else esac export fi for function if in local readonly return set then unset while'.split(' ')),
  sql: new Set('all alter and as asc begin between by case create delete desc distinct drop else end exists from group having in index inner insert into is join left like limit not null on or order outer primary right select set table then union unique update values when where'.split(' ')),
  java: new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends false final finally float for goto if implements import instanceof int interface long native new null package private protected public return short static strictfp super switch synchronized this throw throws transient true try void volatile while'.split(' ')),
  go: new Set('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'.split(' ')),
  c: new Set('auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while'.split(' ')),
  cpp: new Set('alignas alignof and asm auto bool break case catch char class const constexpr continue default delete do double else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected public register reinterpret_cast return short signed sizeof static struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while'.split(' ')),
  kotlin: new Set('as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while'.split(' ')),
  swift: new Set('as associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self Self static struct subscript super switch throw throws true try typealias var where while'.split(' ')),
});

// A shape that can hold text of its own. A text box is the whole shape; a
// rect or an ellipse draws its text inside the outline.
const TEXTUAL = new Set(['rect', 'ellipse']);

// The five pptx line ends, under their pptx names, so a round trip through
// `a:headEnd`/`a:tailEnd` is a rename and nothing else.
const ARROW_ENDS = ['none', 'triangle', 'arrow', 'oval', 'diamond'];
const DEFAULT_PRESET_IDS = [
  'red-filled-rectangle',
  'red-outline-rectangle',
  'numbered-circle',
  'right-open-arrow',
  'left-open-arrow',
];
const PRESET_KIND_LABELS = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
  pen: 'Drawing',
  text: 'Text',
};
const MAX_CLIPBOARD_SHAPES = 100;
const MAX_GEOMETRY = 1_000_000;

  return {
    SLIDE_W,
    SLIDE_H,
    PX_PER_INCH,
    CM_PER_INCH,
    MIN_SLIDE_SIZE,
    MAX_SLIDE_SIZE,
    SLIDE_SIZE_PRESETS,
    DEFAULT_BACKGROUND,
    DEFAULT_STYLE,
    DEFAULT_IMAGE_STYLE,
    BOXY,
    SHAPE_KINDS,
    CODE_FORMATS,
    CODE_LANGUAGES,
    CODE_KEYWORDS,
    TEXTUAL,
    ARROW_ENDS,
    DEFAULT_PRESET_IDS,
    PRESET_KIND_LABELS,
    MAX_CLIPBOARD_SHAPES,
    MAX_GEOMETRY,
  };
});
