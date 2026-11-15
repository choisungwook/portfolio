// akbun-storyboard web UI. Plain JS, no build step. Every write goes through
// POST /api/op/<name>, the same operations the CLI and MCP server expose.
'use strict';

const S = { projects: [], pid: null, p: null, view: 'board', sel: null, rev: -1, commentFilter: 'open', ideaScope: 'project', soundType: 'all' };
const $ = (q) => document.querySelector(q);

// ---------- helpers ----------
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(5)) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}
const icon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.innerHTML = d; return s; };
const TRASH = '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>';
const fmtBytes = (b) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(1) + ' GB' : b >= 1 << 20 ? (b / (1 << 20)).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : (b || 0) + ' B');
const fmt = (sec) => { sec = Math.round(sec || 0); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const fill = (node, ...kids) => node.replaceChildren(...kids.flat(4).filter((k) => k != null && k !== false));
const editing = (root) => { const a = document.activeElement; return a && root.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName); };

async function api(op, args = {}) {
  const r = await fetch('/api/op/' + op, { method: 'POST', headers: { 'X-Storyboard': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
async function upload(file) {
  const q = new URLSearchParams({ name: file.name || 'pasted.png' });
  if (S.pid) q.set('project_id', S.pid);
  const r = await fetch('/api/media?' + q, { method: 'POST', headers: { 'X-Storyboard': '1' }, body: file });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j.id;
}
function status(text) { $('#save-state').textContent = text; }
async function run(fn) {
  status('Saving…');
  try { await fn(); status('Saved'); } catch (e) { status(''); alert(e.message); }
  await refresh();
}

// Debounced field writes: typing does not re-render, the poll picks up the result.
const timers = {};
function saveLater(op, row, key, value) {
  row[key] = value;
  status('Editing…');
  clearTimeout(timers[op + row.id + key]);
  timers[op + row.id + key] = setTimeout(async () => {
    try { await api(op, { id: row.id, [key]: value }); status('Saved'); } catch (e) { status(e.message); }
  }, 450);
}

// ---------- data ----------
async function refresh() {
  S.projects = await api('project_list');
  if (S.pid && !S.projects.some((p) => p.id === S.pid)) S.pid = null;
  if (!S.pid && S.projects.length) S.pid = Number(localStorage.getItem('sb.pid')) || S.projects[0].id;
  if (S.pid && !S.projects.some((p) => p.id === S.pid)) S.pid = S.projects[0].id;
  S.p = S.pid ? await api('project_get', { id: S.pid }) : null;
  S.ideas = await api('idea_list');
  if (S.sel && !findSel()) S.sel = null;
  render();
}
const scenes = () => (S.p ? S.p.scenes : []);
const sceneById = (id) => scenes().find((s) => s.id === id);
function findSel() {
  if (!S.sel || !S.p) return null;
  if (S.sel.type === 'scene') return sceneById(S.sel.id);
  if (S.sel.type === 'music') return S.p.music.find((m) => m.id === S.sel.id);
  if (S.sel.type === 'idea') return S.ideas?.find((i) => i.id === S.sel.id);
}

// Poll the store revision so CLI and MCP edits show up without a reload.
const pending = new Set();
async function poll() {
  try {
    const { rev } = await (await fetch('/api/rev')).json();
    if (rev !== S.rev) { S.rev = rev; await refresh(); }
  } catch { /* server stopped; keep the page */ }
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending.size) render(); }, 0));

// ---------- render ----------
function render() {
  pending.clear();
  renderProjects();
  const t = $('#project-title');
  if (document.activeElement !== t) t.value = S.p ? S.p.title : '';
  t.disabled = !S.p;
  const open = S.p ? S.p.comments.filter((c) => !c.resolved).length : 0;
  $('#open-count').textContent = open || '';
  $('#stats').textContent = S.p ? `${S.p.scenes.length} scenes · ${fmt(S.p.total_dur)} · ${fmtBytes(S.p.media_bytes)}` : 'No project';
  document.querySelectorAll('#view-tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.view === S.view); });
  if (editing($('#view'))) pending.add('view'); else renderView();
  if (editing($('#inspector'))) pending.add('inspector'); else renderInspector();
}

function renderProjects() {
  const ul = $('#project-list');
  ul.replaceChildren(...S.projects.map((p) => el('li', {
    class: p.id === S.pid ? 'on' : '',
    onclick: () => { S.pid = p.id; S.sel = null; localStorage.setItem('sb.pid', p.id); refresh(); },
  }, el('div', {}, p.title || 'Untitled'), el('div', { class: 'pmeta' }, `${p.scene_count} scenes · ${fmt(p.total_dur)} · ${fmtBytes(p.media_bytes)}${p.open_comments ? ` · ${p.open_comments} open` : ''}`))));
}

function renderView() {
  const v = $('#view');
  if (!S.p) {
    fill(v, el('div', { class: 'empty' }, el('p', {}, 'No storyboard yet.'),
      el('p', {}, 'Create one with + Project, import a storyboard.json, or ask an agent to make one.')));
    return;
  }
  const views = { board: viewBoard, script: viewScript, music: viewMusic, ideas: viewIdeas, comments: viewComments };
  fill(v, views[S.view]());
}

function select(sel) {
  S.sel = sel;
  document.querySelectorAll('.card, .grid tr[data-id]').forEach((n) => { n.classList.toggle('on', !!sel && Number(n.dataset.id) === sel.id && n.dataset.type === sel.type); });
  renderInspector();
}

// Board: one row per part, scene cards with an arrow between them.
function viewBoard() {
  if (!scenes().length) return el('div', { class: 'empty' }, 'No scenes. Press + Scene.');
  const groups = S.p.parts.map((pt) => ({ key: pt.key, title: pt.title, items: [] }));
  const other = { key: '', title: 'No part', items: [] };
  for (const s of scenes()) (groups.find((g) => g.key === s.part) || other).items.push(s);
  return [...groups, other].filter((g) => g.items.length).map((g) => {
    const dur = g.items.reduce((a, s) => a + (s.dur || 0), 0);
    const start = g.items[0].start;
    return el('section', { class: 'part' },
      el('div', { class: 'part-head' }, el('h2', {}, g.title || g.key), el('span', { class: 'muted' }, `${g.items.length} scenes · ${fmt(start)}–${fmt(start + dur)}`)),
      el('div', { class: 'cards' }, g.items.map(card)));
  });
}

function card(s) {
  const n = S.p.comments.filter((c) => c.scene_id === s.id && !c.resolved).length;
  const c = el('article', {
    class: 'card' + (S.sel?.type === 'scene' && S.sel.id === s.id ? ' on' : ''), draggable: true,
    onclick: () => select({ type: 'scene', id: s.id }),
    ondragstart: (e) => e.dataTransfer.setData('text/scene', String(s.id)),
    ondragover: (e) => { e.preventDefault(); c.classList.add('drop'); },
    ondragleave: () => c.classList.remove('drop'),
    ondrop: (e) => dropOnCard(e, s, c),
  },
  el('div', { class: 'card-head' }, el('b', {}, `Scene ${s.number}`), el('span', { class: 't' }, `${fmt(s.start)} · ${s.dur}s`), el('span', { class: 'dot ' + s.status, title: s.status })),
  el('div', { class: 'thumb' }, s.media_id ? el('img', { src: `/media/${s.media_id}`, alt: `Scene ${s.number} sketch`, loading: 'lazy' }) : 'Drop or paste a sketch'),
  el('div', { class: 'card-body' },
    s.description && el('div', { class: 'desc' }, s.description),
    s.narration && el('div', { class: 'nar' }, s.narration),
    el('div', { class: 'chips' }, [s.shot, s.move, s.source].filter(Boolean).map((x) => el('span', { class: 'chip' }, x)))),
  n ? el('span', { class: 'cbadge', title: `${n} open comments` }, n) : null);
  c.dataset.id = s.id; c.dataset.type = 'scene';
  return c;
}

async function dropOnCard(e, s, c) {
  e.preventDefault();
  c.classList.remove('drop');
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (file) return run(async () => api('scene_update', { id: s.id, media_id: await upload(file) }));
  const id = Number(e.dataTransfer.getData('text/scene'));
  if (!id || id === s.id) return;
  const before = e.offsetX < c.offsetWidth / 2;
  const list = scenes().filter((x) => x.id !== id);
  const i = list.findIndex((x) => x.id === s.id);
  const after = before ? (i > 0 ? list[i - 1].id : null) : s.id;
  run(async () => {
    await api('scene_move', { id, after_id: after });
    if (sceneById(id).part !== s.part) await api('scene_update', { id, part: s.part });
  });
}

function viewScript() {
  return el('table', { class: 'grid' },
    el('thead', {}, el('tr', {}, ['#', 'Time', 'Part', 'Screen', 'Narration', 'Sec'].map((h) => el('th', {}, h)))),
    el('tbody', {}, scenes().map((s) => {
      const tr = el('tr', { class: S.sel?.type === 'scene' && S.sel.id === s.id ? 'on' : '', onclick: () => select({ type: 'scene', id: s.id }) },
        el('td', { class: 'num' }, s.number),
        el('td', { class: 'num' }, `${fmt(s.start)}–${fmt(s.start + s.dur)}`),
        el('td', {}, s.part),
        el('td', {}, el('textarea', { rows: 2, value: s.description, oninput: (e) => saveLater('scene_update', s, 'description', e.target.value) })),
        el('td', {}, el('textarea', { rows: 2, value: s.narration, oninput: (e) => saveLater('scene_update', s, 'narration', e.target.value) })),
        el('td', { class: 'num' }, el('input', { type: 'number', step: '0.5', min: '0', value: s.dur, style: 'width:60px', onchange: (e) => run(() => api('scene_update', { id: s.id, dur: Number(e.target.value) })) })));
      tr.dataset.id = s.id; tr.dataset.type = 'scene';
      return tr;
    })));
}

// Music holds two kinds of sound: background music (bgm) and sound effects (sfx).
function viewMusic() {
  const total = S.p.total_dur || 1;
  const sc = scenes();
  const span = (m) => {
    const a = sc[(m.from_scene || 1) - 1], b = sc[(m.to_scene || m.from_scene || 1) - 1];
    return a && b ? [a.start, b.start + b.dur] : null;
  };
  const kind = (m) => (m.type === 'sfx' ? 'sfx' : 'bgm');
  const lane = (type) => el('div', { class: 'row', style: 'gap:10px' }, el('span', { class: 'muted', style: 'width:32px' }, type.toUpperCase()),
    el('div', { class: 'timeline', style: 'flex:1', title: `${type} coverage across the video` }, S.p.music.filter((m) => kind(m) === type).map((m) => {
      const r = span(m);
      return r && el('span', { style: `left:${(r[0] / total) * 100}%;width:${Math.max(((r[1] - r[0]) / total) * 100, 0.8)}%` }, `${m.key} ${m.title || m.mood}`);
    })));
  const add = (type) => el('button', { class: 'btn primary', onclick: () => run(async () => {
    const cur = S.sel?.type === 'scene' && sceneById(S.sel.id);
    const n = S.p.music.filter((m) => kind(m) === type).length + 1;
    const range = type === 'sfx' ? [cur ? cur.number : 1, cur ? cur.number : 1] : [1, sc.length || 1];
    const m = await api('music_add', { project_id: S.pid, type, key: `${type}${n}`, from_scene: range[0], to_scene: range[1] });
    S.sel = { type: 'music', id: m.id };
  }) }, type === 'sfx' ? '+ SFX' : '+ BGM');
  const seg = el('div', { class: 'capsule seg' }, [['all', 'All'], ['bgm', 'BGM'], ['sfx', 'SFX']].map(([k, t]) => el('button', { class: S.soundType === k ? 'on' : '', onclick: () => { S.soundType = k; renderView(); } }, t)));
  const list = S.p.music.filter((m) => S.soundType === 'all' || kind(m) === S.soundType);
  const table = el('table', { class: 'grid' },
    el('thead', {}, el('tr', {}, ['Type', 'Key', 'Scenes', 'Time', 'Track', 'Mood · Genre', 'BPM', 'Search keywords'].map((h) => el('th', {}, h)))),
    el('tbody', {}, list.map((m) => {
      const r = span(m);
      const tr = el('tr', { class: S.sel?.type === 'music' && S.sel.id === m.id ? 'on' : '', onclick: () => select({ type: 'music', id: m.id }) },
        el('td', {}, el('span', { class: 'chip' }, kind(m).toUpperCase())), el('td', {}, m.key), el('td', { class: 'num' }, `${m.from_scene ?? '?'}–${m.to_scene ?? '?'}`),
        el('td', { class: 'num' }, r ? `${fmt(r[0])}–${fmt(r[1])}` : ''),
        el('td', {}, m.url ? el('a', { href: m.url, target: '_blank', rel: 'noopener' }, m.title || m.url) : m.title),
        el('td', {}, [m.mood, m.genre].filter(Boolean).join(' · ')), el('td', { class: 'num' }, m.bpm ?? ''), el('td', {}, m.search_keywords));
      tr.dataset.id = m.id; tr.dataset.type = 'music';
      return tr;
    })));
  return [el('div', { class: 'row' }, seg, el('span', { class: 'muted' }, `${S.p.music.filter((m) => kind(m) === 'bgm').length} BGM · ${S.p.music.filter((m) => kind(m) === 'sfx').length} SFX`),
    el('span', { class: 'spacer' }), add('bgm'), add('sfx')),
    el('div', { style: 'margin-top:8px' }, lane('bgm'), lane('sfx')),
    list.length ? table : el('div', { class: 'empty' }, 'Nothing here yet.')];
}

function viewIdeas() {
  const all = S.ideas || [];
  const list = all.filter((i) => (S.ideaScope === 'inbox' ? i.project_id == null : i.project_id === S.pid));
  const text = el('textarea', { class: 'field', rows: 3, placeholder: 'Write an idea. Paste or attach an image too.' });
  let file = null;
  const pick = el('input', { type: 'file', accept: 'image/*', onchange: (e) => { file = e.target.files[0]; } });
  const scope = el('div', { class: 'capsule seg' }, ['project', 'inbox'].map((k) => el('button', { class: S.ideaScope === k ? 'on' : '', onclick: () => { S.ideaScope = k; renderView(); } }, k === 'project' ? 'This project' : 'Inbox')));
  const add = el('button', { class: 'btn primary', onclick: () => run(async () => {
    if (!text.value.trim() && !file) return;
    await api('idea_add', { body: text.value, project_id: S.ideaScope === 'inbox' ? null : S.pid, media_id: file ? await upload(file) : null });
  }) }, 'Add idea');
  return [el('div', { class: 'row' }, scope),
    el('div', { class: 'compose' }, text, el('div', { class: 'row' }, pick, el('span', { class: 'spacer' }), add)),
    list.length ? el('div', { class: 'masonry' }, list.map((i) => el('div', { class: 'idea', onclick: () => select({ type: 'idea', id: i.id }) },
      i.media_id && el('img', { src: `/media/${i.media_id}`, alt: 'Idea image', loading: 'lazy' }), i.body,
      el('div', { class: 'meta' }, i.tags && el('span', { class: 'chip' }, i.tags), el('span', {}, i.created_at), el('span', { class: 'spacer' }),
        el('button', { class: 'btn', title: 'Make this idea a scene', onclick: (e) => { e.stopPropagation(); ideaToScene(i); } }, '→ Scene'))))) : el('div', { class: 'empty' }, 'No ideas here yet.')];
}

function ideaToScene(i) {
  run(async () => {
    const pid = i.project_id ?? S.pid;
    const last = S.p.parts.at(-1);
    const s = await api('scene_add', { project_id: pid, description: i.body, media_id: i.media_id, part: last ? last.key : '' });
    if (i.project_id == null) await api('idea_update', { id: i.id, project_id: pid });
    S.view = 'board';
    S.sel = { type: 'scene', id: s.id };
  });
}

function viewComments() {
  const cs = S.p.comments.filter((c) => (S.commentFilter === 'open' ? !c.resolved : true)).slice().reverse();
  const seg = el('div', { class: 'capsule seg' }, ['open', 'all'].map((k) => el('button', { class: S.commentFilter === k ? 'on' : '', onclick: () => { S.commentFilter = k; renderView(); } }, k === 'open' ? 'Open' : 'All')));
  return [el('div', { class: 'row' }, seg), el('div', { style: 'margin-top:12px;max-width:760px' },
    cs.length ? cs.map((c) => commentNode(c, true)) : el('div', { class: 'empty' }, 'No comments.'))];
}

function commentNode(c, jump) {
  const s = c.scene_id && sceneById(c.scene_id);
  const who = (c.author || 'me').toLowerCase();
  return el('div', { class: 'comment' + (c.resolved ? ' resolved' : ''), onclick: jump && s ? () => { S.view = 'board'; S.sel = { type: 'scene', id: s.id }; render(); } : null },
    el('div', { class: 'who' }, el('span', { class: 'avatar ' + who }, who[0].toUpperCase()), el('b', {}, c.author || 'me'),
      el('span', {}, s ? `Scene ${s.number}` : 'Project'), el('span', {}, c.created_at), el('span', { class: 'spacer' }),
      el('label', { onclick: (e) => e.stopPropagation() }, el('input', { type: 'checkbox', checked: !!c.resolved, onchange: (e) => run(() => api('comment_update', { id: c.id, resolved: e.target.checked ? 1 : 0 })) }), ' Resolved'),
      el('button', { class: 'icon-btn', title: 'Delete comment', 'aria-label': 'Delete comment', onclick: (e) => { e.stopPropagation(); if (confirm('Delete this comment?')) run(() => api('comment_delete', { id: c.id })); } }, icon(TRASH))),
    el('div', { class: 'body' }, c.body));
}

function commentThread(sceneId) {
  const cs = S.p.comments.filter((c) => (c.scene_id ?? null) === sceneId);
  const box = el('textarea', { class: 'field', rows: 2, placeholder: 'Comment. Agents read open comments as requests.' });
  return [cs.map((c) => commentNode(c, false)), box,
    el('div', { class: 'row end' }, el('button', { class: 'btn primary', onclick: () => box.value.trim() && run(() => api('comment_add', { project_id: S.pid, scene_id: sceneId, author: 'me', body: box.value })) }, 'Comment'))];
}

// ---------- inspector ----------
function field(label, row, op, key, kind = 'text', extra = {}) {
  let input;
  const v = row[key];
  const write = (val) => saveLater(op, row, key, val);
  if (kind === 'textarea') input = el('textarea', { value: v ?? '', rows: extra.rows || 3, oninput: (e) => write(e.target.value) });
  else if (kind === 'lines') input = el('textarea', { value: (v || []).join('\n'), rows: 3, oninput: (e) => write(e.target.value.split('\n').filter((x) => x.trim())) });
  else if (kind === 'select') input = el('select', { onchange: (e) => run(() => api(op, { id: row.id, [key]: e.target.value })) }, extra.options.map((o) => el('option', { value: o, selected: o === v }, o || '—')));
  else if (kind === 'number') input = el('input', { type: 'number', step: extra.step || '1', value: v ?? '', oninput: (e) => write(e.target.value === '' ? null : Number(e.target.value)) });
  else input = el('input', { value: v ?? '', list: extra.list, placeholder: extra.placeholder, oninput: (e) => write(e.target.value) });
  return el('label', { class: 'f' }, label, input);
}

function imageBox(row, op) {
  const choose = el('button', { class: 'btn', onclick: () => {
    const f = $('#file-pick');
    f.onchange = () => f.files[0] && run(async () => api(op, { id: row.id, media_id: await upload(f.files[0]) }));
    f.value = ''; f.click();
  } }, row.media_id ? 'Replace image' : 'Choose image');
  const info = row.media_id && S.p?.media.find((m) => m.id === row.media_id);
  const box = el('div', { class: 'ins-thumb', ondragover: (e) => e.preventDefault(), ondrop: (e) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (file) run(async () => api(op, { id: row.id, media_id: await upload(file) }));
  } }, row.media_id ? el('a', { href: `/media/${row.media_id}`, target: '_blank', style: 'display:contents' }, el('img', { src: `/media/${row.media_id}`, alt: 'Attached image' })) : 'Drop, paste, or choose a sketch or photo');
  return [box, el('div', { class: 'row', style: 'margin:6px 0 4px' }, choose,
    row.media_id && el('button', { class: 'btn danger', onclick: () => run(() => api(op, { id: row.id, media_id: null })) }, 'Remove'),
    el('span', { class: 'spacer' }), info && el('span', { class: 'size', title: info.name }, fmtBytes(info.bytes)))];
}

function beatsEditor(s) {
  const beats = (s.beats || []).map((b) => [...b]);
  const save = () => saveLater('scene_update', s, 'beats', beats.filter((b) => b.some((x) => x.trim())));
  const rows = beats.map((b, i) => el('div', { class: 'beat' },
    [0, 1, 2].map((j) => el('input', { value: b[j] || '', placeholder: ['0–2초', 'Screen', 'Caption · sound'][j], oninput: (e) => { b[j] = e.target.value; save(); } })),
    el('button', { class: 'icon-btn', title: 'Remove beat', 'aria-label': 'Remove beat', onclick: () => { beats.splice(i, 1); saveLater('scene_update', s, 'beats', beats); renderInspector(); } }, '×')));
  return [el('div', { class: 'beats' }, rows),
    el('button', { class: 'btn', onclick: () => { s.beats = [...beats, ['', '', '']]; renderInspector(); } }, '+ Beat')];
}

function partsEditor() {
  const rows = S.p.parts.map((pt) => el('div', { class: 'beat' },
    el('input', { value: pt.key, 'aria-label': 'Part key', oninput: (e) => saveLater('part_update', pt, 'key', e.target.value) }),
    el('input', { value: pt.title, 'aria-label': 'Part title', oninput: (e) => saveLater('part_update', pt, 'title', e.target.value) }),
    el('button', { class: 'icon-btn', title: 'Delete part', 'aria-label': 'Delete part', onclick: () => run(() => api('part_delete', { id: pt.id })) }, '×')));
  return [el('div', { class: 'beats parts-ed' }, rows),
    el('button', { class: 'btn', onclick: () => run(() => api('part_add', { project_id: S.pid, key: `part${S.p.parts.length + 1}`, title: 'New part' })) }, '+ Part')];
}

const PANEL_RIGHT = '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M10 3v10M5.5 6.5 7 8 5.5 9.5"/>';
function head(title, onDelete) {
  return el('div', { class: 'ins-head' }, el('h3', {}, title),
    onDelete && el('button', { class: 'icon-btn', title: 'Delete', 'aria-label': 'Delete', onclick: onDelete }, icon(TRASH)),
    el('button', { class: 'icon-btn', title: 'Hide inspector', 'aria-label': 'Hide inspector', onclick: () => setInspector(false) }, icon(PANEL_RIGHT)));
}

// Collapsible section. The header keeps a one-line preview so a closed
// section still says what is inside; the open state is remembered per section.
function group(key, title, preview, defaultOpen, ...kids) {
  let open = defaultOpen;
  try { const v = localStorage.getItem('sb.open.' + key); if (v != null) open = v === '1'; } catch { /* storage blocked */ }
  return el('details', { class: 'group', open, ontoggle: (e) => { try { localStorage.setItem('sb.open.' + key, e.target.open ? '1' : '0'); } catch { /* ignore */ } } },
    el('summary', {}, el('span', { class: 'gt' }, title), el('span', { class: 'pv' }, preview || '')),
    el('div', { class: 'group-body' }, kids));
}
const card0 = (...kids) => el('div', { class: 'group essentials' }, el('div', { class: 'group-body' }, kids));
const filled = (row, keys) => keys.filter((k) => row[k] && String(row[k]).trim()).length;
const openCount = (sceneId) => S.p.comments.filter((c) => (c.scene_id ?? null) === sceneId && !c.resolved).length;

function renderInspector() {
  const ins = $('#inspector');
  if (!S.p) return fill(ins, el('p', { class: 'muted' }, 'Select or create a project.'));
  const row = findSel();
  const op = S.sel ? S.sel.type + '_update' : 'project_update';
  if (S.sel?.type === 'scene' && row) {
    const parts = ['', ...S.p.parts.map((p) => p.key)];
    if (!parts.includes(row.part)) parts.push(row.part);
    const open = openCount(row.id);
    const n = filled(row, ['sketch', 'record', 'ai_prompt']);
    fill(ins,
      head(`Scene ${row.number} · ${fmt(row.start)}–${fmt(row.start + row.dur)}`, () => confirm(`Delete scene ${row.number}?`) && run(async () => { await api('scene_delete', { id: row.id }); S.sel = null; })),
      card0(imageBox(row, op),
        field('Narration', row, op, 'narration', 'textarea', { rows: 3 }),
        field('What is on screen', row, op, 'description', 'textarea', { rows: 2 }),
        el('div', { class: 'pair three' }, field('Part', row, op, 'part', 'select', { options: parts }), field('Seconds', row, op, 'dur', 'number', { step: '0.5' }),
          field('Status', row, op, 'status', 'select', { options: ['todo', 'sketched', 'recorded', 'done'] }))),
      group('comments', 'Comments', open ? `${open} open` : 'none open', open > 0, commentThread(row.id)),
      group('camera', 'Shot & camera', [row.shot, row.move, row.source].filter(Boolean).join(' · '), false,
        el('div', { class: 'pair' }, field('Shot', row, op, 'shot', 'text', { list: 'dl-shot' }), field('Move', row, op, 'move', 'text', { list: 'dl-move' })),
        el('div', { class: 'pair' }, field('Source', row, op, 'source', 'text', { list: 'dl-source' }), field('Move note', row, op, 'move_note')),
        field('Overlay', row, op, 'overlay'),
        field('Intent', row, op, 'intent', 'textarea', { rows: 2 })),
      group('audio', 'Voice & sound', [row.voice, (row.sfx || []).length ? `${row.sfx.length} sfx` : ''].filter(Boolean).join(' · '), false,
        field('Voice', row, op, 'voice', 'select', { options: ['none', 'live', 'adr'] }),
        row.voice === 'adr' && field('Why ADR', row, op, 'adr_reason'),
        field('Sound effects (one per line)', row, op, 'sfx', 'lines')),
      group('beats', 'Beats', `${(row.beats || []).length} beats`, false, beatsEditor(row)),
      group('production', 'Production & AI prompts', `${n}/3 filled`, false,
        field('Sketch prompt (English)', row, op, 'sketch', 'textarea', { rows: 2 }),
        field('How to record', row, op, 'record', 'textarea'),
        field('AI video prompt', row, op, 'ai_prompt', 'textarea')));
  } else if (S.sel?.type === 'music' && row) {
    fill(ins,
      head(`${row.type === 'sfx' ? 'Sound effect' : 'Music'} ${row.key}`, () => run(async () => { await api('music_delete', { id: row.id }); S.sel = null; })),
      card0(field('Type', row, op, 'type', 'select', { options: ['bgm', 'sfx'] }), field('Track title', row, op, 'title'), field('URL', row, op, 'url'),
        el('div', { class: 'pair three' }, field('Key', row, op, 'key'), field('From scene', row, op, 'from_scene', 'number'), field('To scene', row, op, 'to_scene', 'number')),
        el('div', { class: 'pair three' }, field('Mood', row, op, 'mood'), field('Genre', row, op, 'genre'), field('BPM', row, op, 'bpm', 'number'))),
      group('music-search', 'Search & generation', row.search_keywords, false,
        field('Instruments', row, op, 'instruments'), field('Energy', row, op, 'energy', 'textarea', { rows: 2 }),
        field('Search keywords', row, op, 'search_keywords', 'textarea', { rows: 2 }),
        field('Generation prompt', row, op, 'generation_prompt', 'textarea')),
      group('music-note', 'Note', row.note, !!row.note, field('Note', row, op, 'note', 'textarea', { rows: 2 })));
  } else if (S.sel?.type === 'idea' && row) {
    fill(ins,
      head('Idea', () => run(async () => { await api('idea_delete', { id: row.id }); S.sel = null; })),
      card0(imageBox(row, op), field('Idea', row, op, 'body', 'textarea', { rows: 6 }), field('Tags', row, op, 'tags', 'text', { placeholder: 'hook, b-roll' })));
  } else {
    const p = S.p;
    const reaction = p.reaction && typeof p.reaction === 'object' ? { ...p.reaction } : { scene: null, text: '' };
    const open = openCount(null);
    fill(ins,
      head('Project', () => confirm(`Delete "${p.title}" and all its scenes?`) && run(async () => { await api('project_delete', { id: p.id }); S.pid = null; })),
      card0(field('Core message', p, 'project_update', 'message', 'textarea', { rows: 2 }),
        field('Status', p, 'project_update', 'status', 'select', { options: ['draft', 'ready', 'recording', 'editing', 'published'] })),
      group('p-comments', 'Comments', open ? `${open} open` : 'none open', open > 0, commentThread(null)),
      group('p-plan', 'Plan', p.audience, false,
        field('Genre', p, 'project_update', 'genre', 'text', { list: 'dl-genre' }),
        field('Audience', p, 'project_update', 'audience', 'textarea', { rows: 2 }),
        field('Intent', p, 'project_update', 'intent', 'textarea', { rows: 2 }),
        field('Source summary', p, 'project_update', 'source_summary', 'textarea'),
        el('div', { class: 'pair' }, field('Answer scene', p, 'project_update', 'answer_scene', 'number'),
          el('label', { class: 'f' }, 'Reaction scene', el('input', { type: 'number', value: reaction.scene ?? '', oninput: (e) => { reaction.scene = e.target.value === '' ? null : Number(e.target.value); saveLater('project_update', p, 'reaction', reaction); } }))),
        el('label', { class: 'f' }, 'Reaction', el('input', { value: reaction.text || '', oninput: (e) => { reaction.text = e.target.value; saveLater('project_update', p, 'reaction', reaction); } }))),
      group('p-parts', 'Parts', S.p.parts.map((x) => x.title || x.key).join(' · '), false, partsEditor()),
      group('p-production', 'Production', `${(p.production || []).length} rules`, false,
        field('Production rules (one per line)', p, 'project_update', 'production', 'lines'),
        field('Motion style (English)', p, 'project_update', 'motion_style', 'textarea', { rows: 2 })));
  }
}

// ---------- actions ----------
function ask(title, text, value = '') {
  const d = $('#dialog');
  $('#dialog-title').textContent = title;
  $('#dialog-text').textContent = text;
  $('#dialog-input').value = value;
  d.showModal();
  return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'ok' ? $('#dialog-input').value.trim() : null), { once: true }));
}

$('#view-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  S.view = b.dataset.view;
  render();
});
$('#project-title').addEventListener('input', (e) => S.p && saveLater('project_update', S.p, 'title', e.target.value));
// Inspector slides away like the project sidebar; the choice is remembered.
function setInspector(open) {
  document.body.classList.toggle('no-inspector', !open);
  try { localStorage.setItem('sb.inspector', open ? '1' : '0'); } catch { /* ignore */ }
}
$('#btn-inspector').addEventListener('click', () => setInspector(true));
try { if (localStorage.getItem('sb.inspector') === '0') setInspector(false); } catch { /* ignore */ }
$('#btn-add-scene').addEventListener('click', () => S.p && run(async () => {
  const cur = S.sel?.type === 'scene' && sceneById(S.sel.id);
  const part = cur ? cur.part : (S.p.parts.at(-1)?.key || '');
  const s = await api('scene_add', { project_id: S.pid, part, dur: 5, after_id: cur ? cur.id : undefined });
  S.sel = { type: 'scene', id: s.id };
  if (S.view !== 'script') S.view = 'board';
}));
async function newProject() {
  await run(async () => {
    const p = await api('project_add', { title: 'Untitled storyboard' });
    for (const [key, title] of [['hook', 'Hook'], ['body', 'Body'], ['wrap', 'Wrap-up']]) await api('part_add', { project_id: p.id, key, title });
    S.pid = p.id; S.sel = null; localStorage.setItem('sb.pid', p.id);
  });
}
$('#btn-new-project').addEventListener('click', newProject);

const safeName = () => (S.p?.title || 'storyboard').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
function download(data, name, type) {
  el('a', { href: URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })), download: name }).click();
}
// navigator.clipboard exists only on secure origins; the iPad LAN mode is plain http.
async function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const t = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
  document.body.append(t);
  t.select();
  const ok = document.execCommand('copy');
  t.remove();
  if (!ok) throw new Error('This browser blocked copying. Use Full storyboard (.md) instead.');
}
const lastPath = (k, v) => { try { if (v !== undefined) localStorage.setItem('sb.path.' + k, v); return localStorage.getItem('sb.path.' + k) || ''; } catch { return ''; } };
const needProject = (fn) => () => (S.p ? fn() : alert('Open or create a project first.'));
async function exportText(format, suffix, ext, type) {
  const { text } = await api('project_render', { id: S.pid, format });
  download(text, `${safeName()}${suffix}.${ext}`, type);
}

// Every menu item and shortcut button runs through this table.
const COMMANDS = {
  new: newProject,
  'open-zip': () => {
    const f = $('#zip-pick');
    f.value = '';
    f.onchange = () => f.files[0] && run(async () => {
      status('Opening…');
      const r = await fetch('/api/project.zip', { method: 'POST', headers: { 'X-Storyboard': '1' }, body: f.files[0] });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      S.pid = j.id; S.sel = null; localStorage.setItem('sb.pid', j.id);
    });
    f.click();
  },
  'save-zip': needProject(async () => {
    status('Packing…');
    const r = await fetch(`/api/project.zip?id=${S.pid}`);
    if (!r.ok) return alert((await r.json().catch(() => ({}))).error || r.statusText);
    download(await r.blob(), `${safeName()}.zip`);
    status('Saved zip');
  }),
  'import-json': async () => {
    const path = await ask('Import storyboard.json', 'Absolute path of a storyboard.json from the storyboard skills. sketches/cut_NN.png next to it are attached.', lastPath('import'));
    if (path) { lastPath('import', path); run(async () => { const r = await api('project_import', { path }); S.pid = r.id; S.sel = null; }); }
  },
  'export-json': needProject(async () => {
    const path = await ask('Export storyboard.json', 'Absolute path to write storyboard.json and sketches/. Leave empty to download the JSON only.', lastPath('export'));
    if (path === null) return;
    if (path) { lastPath('export', path); return run(() => api('project_export', { id: S.pid, path })); }
    download(JSON.stringify(await api('project_export', { id: S.pid }), null, 2), 'storyboard.json', 'application/json');
  }),
  'delete-project': needProject(() => {
    if (confirm(`Delete "${S.p.title}"? Its scenes and images are removed from disk.`)) run(async () => { await api('project_delete', { id: S.pid }); S.pid = null; S.sel = null; });
  }),
  settings: () => openSettings(),
  'add-scene': needProject(() => $('#btn-add-scene').click()),
  'delete-scene': needProject(() => {
    const s = S.sel?.type === 'scene' && sceneById(S.sel.id);
    if (!s) return alert('Select a scene first.');
    if (confirm(`Delete scene ${s.number}?`)) run(async () => { await api('scene_delete', { id: s.id }); S.sel = null; });
  }),
  'add-bgm': needProject(() => { S.view = 'music'; render(); document.querySelector('#view .btn.primary')?.click(); }),
  'add-sfx': needProject(() => { S.view = 'music'; render(); document.querySelectorAll('#view .btn.primary')[1]?.click(); }),
  'add-idea': needProject(() => { S.view = 'ideas'; render(); document.querySelector('#view .compose textarea')?.focus(); }),
  'export-markdown': needProject(() => exportText('markdown', '', 'md', 'text/markdown')),
  'export-narration': needProject(() => exportText('narration', '-narration', 'md', 'text/markdown')),
  'export-csv': needProject(() => exportText('csv', '-shotlist', 'csv', 'text/csv')),
  'export-copy': needProject(async () => { await copyText((await api('project_render', { id: S.pid, format: 'markdown' })).text); status('Copied full storyboard'); }),
  'toggle-sidebar': () => setSidebar(document.body.classList.contains('no-sidebar')),
  'toggle-inspector': () => setInspector(document.body.classList.contains('no-inspector')),
};
for (const v of ['board', 'script', 'music', 'ideas', 'comments']) COMMANDS['view-' + v] = () => { S.view = v; render(); };

// Menu bar behaviour: click a title to open, hover to switch while one is open, Escape or outside click closes.
const closeMenus = () => document.querySelectorAll('.menu-title').forEach((t) => { t.setAttribute('aria-expanded', 'false'); document.querySelector(`[data-menu-panel="${t.dataset.menu}"]`).hidden = true; });
function openMenu(t) {
  closeMenus();
  t.setAttribute('aria-expanded', 'true');
  const panel = document.querySelector(`[data-menu-panel="${t.dataset.menu}"]`);
  panel.querySelectorAll('[data-command^="view-"]').forEach((b) => { b.classList.toggle('checked', b.dataset.command === 'view-' + S.view); });
  panel.querySelector('[data-command="toggle-sidebar"]')?.classList.toggle('checked', !document.body.classList.contains('no-sidebar'));
  panel.querySelector('[data-command="toggle-inspector"]')?.classList.toggle('checked', !document.body.classList.contains('no-inspector'));
  panel.querySelector('[data-command="delete-scene"]')?.toggleAttribute('disabled', S.sel?.type !== 'scene');
  panel.hidden = false;
}
$('#menubar').addEventListener('click', (e) => {
  const t = e.target.closest('.menu-title');
  if (t) return t.getAttribute('aria-expanded') === 'true' ? closeMenus() : openMenu(t);
  const c = e.target.closest('[data-command]');
  if (!c) return;
  closeMenus();
  Promise.resolve(COMMANDS[c.dataset.command]()).catch((err) => alert(err.message));
});
$('#menubar').addEventListener('mouseover', (e) => {
  const t = e.target.closest('.menu-title');
  if (t && document.querySelector('.menu-title[aria-expanded="true"]') && t.getAttribute('aria-expanded') !== 'true') openMenu(t);
});
document.addEventListener('click', (e) => { if (!e.target.closest('#menubar')) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

// Settings: image folder and disk use.
async function openSettings() {
  const [set, st] = await Promise.all([api('settings_get'), api('storage_info')]);
  $('#set-media-root').value = set.media_root;
  $('#set-default').textContent = `Default: ${set.default_media_root}`;
  fill($('#set-storage'),
    el('table', { class: 'grid storage' }, el('tbody', {},
      el('tr', {}, el('td', {}, 'Database'), el('td', { class: 'num' }, fmtBytes(st.db_bytes))),
      el('tr', {}, el('td', {}, `Images (${st.media_count})`), el('td', { class: 'num' }, fmtBytes(st.media_bytes))),
      el('tr', {}, el('td', {}, `Unused images (${st.unused_count})`), el('td', { class: 'num' }, fmtBytes(st.unused_bytes))),
      st.projects.map((p) => el('tr', {}, el('td', {}, `· ${p.title || 'Untitled'} (${p.media_count} images)`), el('td', { class: 'num' }, fmtBytes(p.media_bytes)))))),
    el('div', { class: 'row end' }, el('span', { class: 'muted', style: 'flex:1;font-size:11px' }, `Data: ${st.data_dir}`),
      el('button', { type: 'button', class: 'btn', disabled: !st.unused_count, onclick: async () => { const r = await api('media_gc'); status(`Freed ${fmtBytes(r.freed_bytes)}`); openSettings(); } }, 'Delete unused images')));
  if (!$('#settings').open) $('#settings').showModal();
}
async function saveRoot(v) {
  try { await api('settings_update', { media_root: v }); status('Image folder changed'); openSettings(); await refresh(); } catch (e) { alert(e.message); }
}
$('#set-save').addEventListener('click', () => saveRoot($('#set-media-root').value));
$('#set-reset').addEventListener('click', () => saveRoot(''));

// Project sidebar can slide away; the choice is remembered.
const setSidebar = (open) => { document.body.classList.toggle('no-sidebar', !open); try { localStorage.setItem('sb.sidebar', open ? '1' : '0'); } catch { /* ignore */ } };
$('#btn-sidebar-close').addEventListener('click', () => setSidebar(false));
$('#btn-sidebar-open').addEventListener('click', () => setSidebar(true));
try { if (localStorage.getItem('sb.sidebar') === '0') setSidebar(false); } catch { /* ignore */ }

// Paste an image: on a selected scene or idea it becomes its picture; in Ideas it becomes a new idea.
document.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (!file || !S.p) return;
  e.preventDefault();
  if (S.sel && (S.sel.type === 'scene' || S.sel.type === 'idea')) run(async () => api(S.sel.type + '_update', { id: S.sel.id, media_id: await upload(file) }));
  else if (S.view === 'ideas') run(async () => api('idea_add', { project_id: S.ideaScope === 'inbox' ? null : S.pid, media_id: await upload(file) }));
});

// Arrow keys walk scenes on the board; Escape returns to project properties.
document.addEventListener('keydown', (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || $('#dialog').open || $('#settings').open) return;
  if (e.key === 'Escape') select(null);
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && scenes().length) {
    const i = scenes().findIndex((s) => S.sel?.type === 'scene' && s.id === S.sel.id);
    const n = Math.max(0, Math.min(scenes().length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
    select({ type: 'scene', id: scenes()[n].id });
    document.querySelector('.card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
});

poll();
setInterval(poll, 2000);
