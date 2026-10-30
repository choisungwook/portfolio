'use strict';

// Library mode: folders and tags on the left, the grid in the middle, rating
// and tags for the selection on the right.

(function () {
  const mp = window.mp;
  const lib = globalThis.makephotoLib;
  const $ = (id) => document.getElementById(id);
  const s = mp.state;

  // --- thumbnails ---------------------------------------------------------

  // id -> { key, url }. The key changes with the edit, so an edited photo
  // gets a new thumbnail and an untouched one is never asked for twice.
  const thumbs = new Map();
  const waiting = new Map(); // id -> Set of <img>
  let queued = new Set();
  let timer = null;

  const thumbKey = (p) => `${p.path}|${p.missing}|${JSON.stringify(p.edit)}`;

  function setThumb(img, id) {
    const p = s.byId.get(id);
    if (!p) return;
    const known = thumbs.get(id);
    if (known && known.key === thumbKey(p)) {
      if (known.url) img.src = known.url;
      else img.classList.add('broken');
      return;
    }
    img.removeAttribute('src');
    if (!waiting.has(id)) waiting.set(id, new Set());
    waiting.get(id).add(img);
    queued.add(id);
    if (!timer) timer = setTimeout(flush, 30);
  }

  async function flush() {
    timer = null;
    const ids = [...queued].slice(0, 24);
    for (const id of ids) queued.delete(id);
    if (queued.size) timer = setTimeout(flush, 30);
    if (!ids.length) return;
    let results = [];
    try {
      results = await mp.api.thumbnails(ids);
    } catch (error) {
      console.error('thumbnails', error);
    }
    for (const r of results) {
      const p = s.byId.get(r.id);
      if (!p) continue;
      const url = r.path ? mp.api.convertFileSrc(r.path) : null;
      thumbs.set(r.id, { key: thumbKey(p), url });
      for (const img of waiting.get(r.id) || []) {
        if (!img.isConnected) continue;
        if (url) { img.src = url; img.classList.remove('broken'); } else img.classList.add('broken');
        if (r.error) img.title = r.error;
      }
      waiting.delete(r.id);
    }
  }

  // Ask for a thumbnail only once its cell scrolls into view.
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      setThumb(e.target, Number(e.target.dataset.id));
    }
  }, { rootMargin: '400px' });

  function thumbImage(id) {
    const img = document.createElement('img');
    img.dataset.id = id;
    img.alt = '';
    img.draggable = false;
    observer.observe(img);
    return img;
  }

  // --- what is shown ------------------------------------------------------

  function visiblePhotos() {
    return lib.filterPhotos(s.view.photos, s.filter);
  }

  function filterLabel() {
    if (s.filter.folder) return `Folder: ${lib.shortPath(s.filter.folder)}`;
    if (s.filter.tag) return `Tag: ${s.filter.tag}`;
    if (s.filter.edited) return 'Edited photos';
    return 'All photos';
  }

  function setFilter(change) {
    Object.assign(s.filter, { folder: null, tag: null, edited: false }, change);
    render();
  }

  // --- sidebar -------------------------------------------------------------

  function renderSidebar() {
    $('count-all').textContent = s.view.photos.length;
    $('count-edited').textContent = s.view.photos.filter((p) => !lib.isDefaultEdit(p.edit)).length;
    $('nav-all').classList.toggle('active', !s.filter.folder && !s.filter.tag && !s.filter.edited);
    $('nav-edited').classList.toggle('active', s.filter.edited);

    const folders = $('folder-list');
    folders.replaceChildren(...s.view.folders.map((f) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'nav-item' + (s.filter.folder === f.path ? ' active' : '') + (f.missing ? ' offline' : '');
      button.title = f.path;
      button.textContent = lib.shortPath(f.path);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = f.missing ? 'offline' : f.count;
      button.append(count);
      button.onclick = () => setFilter({ folder: f.path });
      li.append(button);
      if (f.missing) {
        const locate = document.createElement('button');
        locate.className = 'small';
        locate.textContent = 'Locate…';
        locate.title = 'Point these photos at the folder where they are now';
        locate.onclick = () => locateFolder(f.path);
        li.append(locate);
      }
      return li;
    }));

    const tags = $('tag-list');
    tags.replaceChildren(...s.view.tags.map(([tag, count]) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'nav-item' + (s.filter.tag === tag ? ' active' : '');
      button.textContent = tag;
      const n = document.createElement('span');
      n.className = 'count';
      n.textContent = count;
      button.append(n);
      button.onclick = () => setFilter({ tag });
      button.ondblclick = () => renameTagInline(li, tag);
      li.append(button);
      return li;
    }));

    $('tag-options').replaceChildren(...s.view.tags.map(([tag]) => {
      const o = document.createElement('option');
      o.value = tag;
      return o;
    }));
  }

  function renameTagInline(li, tag) {
    const input = document.createElement('input');
    input.value = tag;
    li.replaceChildren(input);
    input.focus();
    input.select();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const to = input.value.trim();
      if (save && to && to !== tag) {
        try {
          await mp.api.renameTag(tag, to);
          if (s.filter.tag === tag) s.filter.tag = to;
        } catch (e) { mp.showError(e); }
      }
      render();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    };
    input.onblur = () => finish(true);
  }

  async function locateFolder(from) {
    const to = await mp.api.dialog.open({ directory: true, title: `Where is ${lib.shortPath(from)} now?` });
    if (!to) return;
    try {
      await mp.api.relink(from, to);
      if (s.filter.folder === from) s.filter.folder = to;
      render();
    } catch (e) { mp.showError(e); }
  }

  // --- grid -----------------------------------------------------------------

  function renderGrid() {
    const photos = visiblePhotos();
    $('empty').hidden = s.view.photos.length > 0;
    $('filter-label').textContent = `${filterLabel()} · ${photos.length}`;
    const grid = $('grid');
    const order = photos.map((p) => p.id);
    grid.replaceChildren(...photos.map((p) => {
      const cell = document.createElement('div');
      cell.className = 'cell' + (s.selection.has(p.id) ? ' selected' : '') + (p.missing ? ' missing' : '');
      cell.dataset.id = p.id;
      cell.title = p.name;
      const frame = document.createElement('div');
      frame.className = 'frame';
      frame.append(thumbImage(p.id));
      const caption = document.createElement('div');
      caption.className = 'caption';
      caption.textContent = (p.rating ? '★'.repeat(p.rating) + ' ' : '') + p.name;
      cell.append(frame, caption);
      if (!lib.isDefaultEdit(p.edit)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'edited';
        cell.append(badge);
      }
      cell.onclick = (e) => {
        s.selection = lib.nextSelection(s.selection, order, p.id, {
          toggle: e.metaKey || e.ctrlKey,
          range: e.shiftKey,
          anchor: s.anchor,
        });
        if (!e.shiftKey) s.anchor = p.id;
        s.current = p.id;
        renderSelection();
      };
      cell.ondblclick = () => mp.app.openEditor(p.id);
      return cell;
    }));
  }

  /** Only the selection changed: update classes, not the whole grid. */
  function renderSelection() {
    for (const cell of $('grid').children) {
      cell.classList.toggle('selected', s.selection.has(Number(cell.dataset.id)));
    }
    renderInfo();
  }

  // --- info panel -----------------------------------------------------------

  function selectedPhotos() {
    return [...s.selection].map((id) => s.byId.get(id)).filter(Boolean);
  }

  function renderInfo() {
    const photos = selectedPhotos();
    const one = photos.length === 1 ? photos[0] : null;
    $('info-name').textContent = one ? one.name : photos.length ? `${photos.length} photos selected` : 'No photo selected';
    $('info-path').textContent = one ? one.path : '';
    $('info-missing').hidden = !photos.some((p) => p.missing);
    $('open-edit').disabled = !photos.length;

    const rating = photos.length && photos.every((p) => p.rating === photos[0].rating) ? photos[0].rating : 0;
    $('stars').replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
      const b = document.createElement('button');
      b.className = 'star' + (n <= rating ? ' on' : '');
      b.textContent = '★';
      b.title = `${n} star${n > 1 ? 's' : ''} (click again to clear)`;
      b.disabled = !photos.length;
      b.onclick = () => rate(n === rating ? 0 : n);
      return b;
    }));

    const { all, some } = lib.commonTags(photos);
    $('tag-chips').replaceChildren(...[...all.map((t) => [t, true]), ...some.map((t) => [t, false])].map(([tag, everyone]) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (everyone ? '' : ' partial');
      chip.title = everyone ? tag : `${tag} (on some of the selected photos)`;
      chip.textContent = tag;
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = `Remove ${tag}`;
      x.onclick = () => mp.api.tag(photos.map((p) => p.id), [], [tag]).catch(mp.showError);
      chip.append(x);
      return chip;
    }));
    $('tag-input').disabled = !photos.length;
  }

  async function rate(n) {
    const ids = [...s.selection];
    if (!ids.length) return;
    try { await mp.api.rate(ids, n); } catch (e) { mp.showError(e); }
  }

  $('tag-input').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
    if (!tags.length || !s.selection.size) return;
    e.target.value = '';
    try { await mp.api.tag([...s.selection], tags, []); } catch (err) { mp.showError(err); }
  });

  $('nav-all').onclick = () => setFilter({});
  $('nav-edited').onclick = () => setFilter({ edited: true });
  $('search').addEventListener('input', (e) => { s.filter.search = e.target.value; renderGrid(); });
  $('rating-filter').addEventListener('change', (e) => { s.filter.minRating = Number(e.target.value); renderGrid(); });
  $('thumb-size').addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--thumb', `${e.target.value}px`);
  });
  $('open-edit').onclick = () => s.selection.size && mp.app.openEditor([...s.selection][0]);

  function render() {
    renderSidebar();
    renderGrid();
    renderInfo();
  }

  mp.onView(() => render());

  mp.library = { render, visiblePhotos, thumbImage, selectedPhotos, rate };
})();
