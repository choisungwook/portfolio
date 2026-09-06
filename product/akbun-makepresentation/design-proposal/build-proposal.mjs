import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
let html = await readFile(new URL('../workspace/src/index.html', root), 'utf8');
html = html.replace('href="style.css"', 'href="../workspace/src/style.css"');
html = html.replaceAll(/<script src="([^"]+)"/g, '<script src="../workspace/src/$1"');
html = html.replace('id="btn-ai-new" type="button" class="primary">New', 'id="btn-ai-new" type="button" class="primary">New conversation');
html = html.replace('</head>', '<link rel="stylesheet" href="proposal.css" />\n</head>');
html = html.replace('<body>', `<body class="proposal">
  <div class="review-bar" aria-label="Design comparison">
    <strong>UI proposal</strong>
    <span class="review-subtitle">A quieter, familiar editor</span>
    <div class="review-switch" aria-label="Compare views">
      <button id="show-proposal" aria-pressed="true">Proposed</button>
      <button id="show-original" aria-pressed="false">Current</button>
    </div>
    <button id="show-rationale">Design notes</button>
    <label class="language-control" for="proposal-language"><span>Language</span>
      <select id="proposal-language" data-language-select data-i18n-skip>
        <option value="en">English</option><option value="ko">한국어</option>
      </select>
    </label>
  </div>
  <header class="document-bar proposal-only">
    <div class="document-heading"><strong data-i18n-skip>쿠버네티스 네트워크</strong><span id="document-state">Example document</span></div>
    <div class="document-actions">
      <button id="proposal-save">Save</button>
      <button id="proposal-export">Export</button>
      <button id="proposal-present">Start presentation</button>
      <button id="proposal-panel" aria-pressed="false" title="Collapse the properties panel to make more room">Hide panel</button>
    </div>
  </header>`);
html = html.replace('</body>', `
  <dialog id="rationale-dialog" class="review-dialog">
    <form method="dialog"><button class="dialog-close">Close</button></form>
    <h1>A familiar editor, easier to use</h1>
    <p class="review-lead">The slide takes center stage. Tools stay quiet until you need them.</p>
    <dl class="concept-definitions"><div><dt>UI</dt><dd>The visible interface: buttons, text size, color, and layout.</dd></div><div><dt>UX</dt><dd>The process of finding tools, editing content, and checking the result.</dd></div></dl>
    <h2>What changed</h2>
    <table><thead><tr><th>Current interface</th><th>Proposal</th><th>Benefit</th></tr></thead><tbody>
      <tr><td>Document state appears only in the window title</td><td>Keep the name, state, and save action together</td><td>Know which document you are editing</td></tr>
      <tr><td>Some tools use symbols alone</td><td>Short, localized labels and shortcut hints</td><td>Recognize tools without hovering over each one</td></tr>
      <tr><td>Disabled properties remain visible without a selection</td><td>Show slide information and a selection hint</td><td>See what you can do next</td></tr>
      <tr><td>Wide, fixed side panels</td><td>Narrower panels that can collapse</td><td>More working space in smaller windows</td></tr>
      <tr><td>Shape and text controls form one long list</td><td>Name the selection and group related settings</td><td>Find the property you want to change</td></tr>
    </tbody></table>
    <h2>Try it</h2>
    <ol><li>Switch between Current and Proposed to compare the same slide.</li><li>Drag the Service shape, or double-click it to edit its text.</li><li>Click empty space to see the selection hint, then hide the panel.</li></ol>
    <p>This proposal uses the real editor logic. Changes stay in memory and reset on reload. Saving, exporting, and AI generation require the desktop app.</p>
    <h2>Applied skill</h2>
    <p><a href="https://github.com/anthropics/skills/tree/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/frontend-design" target="_blank" rel="noreferrer">Official Anthropic frontend-design</a> · <span>Verified September 6, 2026</span></p>
    <p>Product-specific layout, clear wording, and restrained decoration. System fonts and existing editing behavior suit this macOS slide editor.</p>
  </dialog>
  <dialog id="desktop-notice" class="review-dialog compact-dialog"><form method="dialog"><button class="dialog-close">Close</button></form><h2>Available in the desktop app</h2><p>Review the layout and editing flow here. Saving, exporting, and AI generation connect in the desktop app.</p></dialog>
  <script src="messages.js"></script>
  <script src="i18n.js"></script>
  <script src="prototype.js"></script>
</body>`);
const requiredMarkers = [
  'href="../workspace/src/style.css"',
  '<script src="../workspace/src/renderer.js"',
  'href="proposal.css"',
  '<body class="proposal">',
  'class="review-bar"',
  'id="proposal-language"',
  'id="btn-ai-new" type="button" class="primary">New conversation',
  '<script src="messages.js"',
  '<script src="i18n.js"',
  '<script src="prototype.js"',
];
for (const marker of requiredMarkers) {
  if (!html.includes(marker)) throw new Error(`Proposal generation failed: missing ${marker}. Check workspace/src/index.html.`);
}
await writeFile(new URL('index.html', root), html);
