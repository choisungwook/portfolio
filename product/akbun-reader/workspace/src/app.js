import { bodyBlocks } from './body.js';
import { action, api, backButton, beginView, documentItem, emptyState, heading, locations, main, message, node, pager, splitTags, state, views } from './ui.js';
import './tags.js';
import './feeds.js';
import './shares.js';

async function loadTags() {
  const generation = state.generation;
  const result = await api('/tags');
  if (generation !== state.generation) return;
  const select = document.querySelector('#tag-filter');
  select.replaceChildren(new Option('모든 태그', ''));
  for (const tag of result.tags) select.add(new Option(`${tag.name} (${tag.count})`, tag.name));
  select.value = state.tag;
}

async function showList() {
  const generation = beginView('글을 불러오는 중…', false);
  for (const button of document.querySelectorAll('#locations button')) {
    button.setAttribute('aria-current', button.dataset.location === state.location ? 'page' : 'false');
  }
  const load = offset => api(`/documents?${new URLSearchParams({ location: state.location, tag: state.tag, offset: String(offset ?? 0) })}`);
  const result = await load(0);
  if (generation !== state.generation) return;
  const title = heading(locations[state.location]);
  title.append(action(node('button', '새로고침'), async () => { await showList(); await loadTags(); }));
  const list = node('ul', undefined, 'document-list');
  const append = page => { for (const document of page.documents) list.append(documentItem(document)); };
  append(result);
  main.replaceChildren(title, list);
  if (!result.documents.length) main.append(emptyState('아직 담긴 글이 없어요', '읽고 싶은 글의 URL을 저장해 보세요. 태그를 선택했다면 다른 태그로도 찾아보세요.'));
  main.append(pager(generation, result, load, append));
}

async function showDocument(id) {
  const generation = beginView('본문을 불러오는 중…');
  const document = await api(`/documents/${encodeURIComponent(id)}`);
  if (generation !== state.generation) return;
  const article = node('article', undefined, 'article');
  article.append(node('h1', document.title));
  const original = node('a', '원문 열기');
  original.href = document.normalized_url; original.target = '_blank'; original.rel = 'noopener noreferrer';
  article.append(original);
  const update = async patch => {
    await api(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify({ version: document.version, ...patch }) });
    await showDocument(id); await loadTags(); message('변경사항을 저장했습니다.');
  };
  const toolbar = node('div', undefined, 'toolbar');
  toolbar.append(action(node('button', document.is_read ? '안 읽음으로 표시' : '읽음으로 표시'), () => update({ is_read: !document.is_read })));
  const position = node('select'); position.setAttribute('aria-label', '문서 위치');
  for (const [key, label] of Object.entries(locations)) position.add(new Option(label, key));
  position.value = document.location;
  toolbar.append(position, action(node('button', '이동'), () => update({ location: position.value })), action(node('button', '새로고침'), () => showDocument(id)));
  article.append(toolbar);
  if (document.tags.length) {
    const pills = node('div', undefined, 'pills');
    for (const tag of document.tags) pills.append(action(node('button', tag, 'pill'), () => views.tag(tag)));
    article.append(pills);
  }
  if (document.summary.length) {
    const summary = node('section', undefined, 'summary');
    summary.append(node('h2', 'AI 3줄 요약'));
    const lines = node('ul');
    for (const line of document.summary) lines.append(node('li', line));
    summary.append(lines); article.append(summary);
  }
  const extractionStatuses = { pending: '원문에서 본문을 가져오는 중입니다. 잠시 후 새로고침하세요.', failed: '본문을 가져오지 못했습니다. 저장한 원문 링크에서 읽어주세요.' };
  if (extractionStatuses[document.extraction_status]) article.append(node('p', extractionStatuses[document.extraction_status], 'meta'));
  const statuses = { pending: 'AI 요약 준비 중 · 잠시 후 새로고침하세요.', skipped: 'AI 요약 없음 · 본문 또는 모델 설정이 필요합니다.', limited: '이번 달 AI 사용 상한에 도달했습니다.', failed: 'AI 요약에 실패했습니다. 저장한 글은 유지됩니다.' };
  if (document.extraction_status !== 'pending' && statuses[document.ai_status]) article.append(node('p', statuses[document.ai_status], 'meta'));
  const body = node('div', undefined, 'body');
  for (const block of bodyBlocks(document.body || (document.extraction_status === 'pending' ? '본문을 준비하고 있습니다.' : '저장된 본문이 없습니다. 원문 링크에서 읽어주세요.'))) body.append(node(block.tag, block.text));
  article.append(body);
  const form = node('form');
  const label = node('label', '태그 편집 (쉼표로 구분)');
  const input = node('input'); input.value = document.tags.join(', '); input.maxLength = 2400;
  label.append(input); form.append(label);
  const save = node('button', '태그 저장', 'primary'); save.type = 'submit'; form.append(save);
  form.addEventListener('submit', async event => {
    event.preventDefault(); save.disabled = true;
    try { await update({ tags: splitTags(input.value) }); } catch (error) { message(error.message, true); }
    finally { save.disabled = false; }
  });
  article.append(form);
  if (document.suggested_tags.length) {
    article.append(node('p', '추천 태그 · 선택하면 추가됩니다.'));
    const suggestions = node('div', undefined, 'pills');
    for (const tag of document.suggested_tags) suggestions.append(action(node('button', `+ ${tag}`), () => update({ approve_tags: [tag] })));
    article.append(suggestions);
  }
  main.replaceChildren(backButton(), article); main.focus();
}

async function showSettings() {
  const generation = beginView('설정을 불러오는 중…');
  const [result, ai] = await Promise.all([api('/tokens'), api('/ai')]);
  if (generation !== state.generation) return;
  const content = node('div', undefined, 'settings');
  content.append(heading('설정'));
  const tokens = node('section'); tokens.append(node('h2', 'API 토큰'));
  tokens.append(node('p', '단축어와 CLI에서 사용할 토큰입니다. 발급한 값은 한 번만 표시됩니다.'));
  const form = node('form'); const label = node('label', '토큰 이름');
  const input = node('input'); input.required = true; input.maxLength = 80; input.placeholder = '예: iPhone 단축어';
  label.append(input); const create = node('button', '토큰 발급', 'primary'); create.type = 'submit';
  form.append(label, create); tokens.append(form);
  const secret = node('div'); secret.setAttribute('aria-live', 'polite'); tokens.append(secret);
  form.addEventListener('submit', async event => {
    event.preventDefault(); create.disabled = true;
    try {
      const created = await api('/tokens', { method: 'POST', body: JSON.stringify({ name: input.value }) });
      if (generation !== state.generation) return;
      secret.replaceChildren(node('p', '지금 복사하세요. 화면을 나가면 다시 볼 수 없습니다.'), node('code', created.token, 'secret'));
      addToken(created); form.reset();
    } catch (error) { message(error.message, true); } finally { create.disabled = false; }
  });
  function addToken(token) {
    if (token.revoked_at) return;
    const row = node('div', undefined, 'token'); row.append(node('span', token.name));
    row.append(action(node('button', '폐기'), async () => {
      await api(`/tokens/${token.id}`, { method: 'DELETE' }); row.remove(); secret.replaceChildren(); message('토큰을 폐기했습니다.');
    })); tokens.append(row);
  }
  for (const token of result.tokens) addToken(token);
  const usage = node('section'); usage.append(node('h2', 'AI 사용량'));
  usage.append(node('p', ai.enabled ? `이번 달 ${ai.usage.calls}/${ai.limits.calls}회 · 예약 비용 ${ai.usage.reserved_won}/${ai.limits.budget}원` : 'AI가 비활성화되어 있습니다. 모델과 비용 상한을 설정하면 사용할 수 있습니다.'));
  const shortcut = node('section'); shortcut.append(node('h2', 'iPhone 공유 저장'));
  const steps = node('ol');
  for (const step of ['단축어 앱에서 새 단축어를 만들고 공유 시트 표시, 입력 URL을 선택하세요.', `URL 콘텐츠 가져오기: ${location.origin}/automation/documents, POST, JSON 본문 url에 단축어 입력을 넣으세요.`, 'Authorization 헤더에 Bearer 뒤 공백과 발급한 토큰을 넣으세요.', '응답을 알림으로 표시하세요. 통신이 실패하면 같은 URL을 다시 공유하세요. 토큰이 들어 있는 단축어는 타인과 공유하지 마세요.']) steps.append(node('li', step));
  shortcut.append(steps, node('p', '홈 화면 추가: Safari 공유 메뉴 → 홈 화면에 추가. 오프라인 읽기는 지원하지 않습니다.'));
  content.append(tokens, usage, shortcut);
  main.replaceChildren(backButton(), content);
}

views.list = showList;
views.document = showDocument;
for (const [key, label] of Object.entries(locations)) {
  const button = action(node('button', label), async () => { state.location = key; await showList(); });
  button.dataset.location = key; document.querySelector('#locations').append(button);
}
for (const [key, label] of [['feeds', 'RSS'], ['tags', '태그'], ['shares', '공개 링크']]) {
  document.querySelector('#sections').append(action(node('button', label), () => views[key]()));
}
document.querySelector('#tag-filter').addEventListener('change', async event => {
  state.tag = event.target.value;
  try { await showList(); } catch (error) { message(error.message, true); }
});
action(document.querySelector('#settings'), showSettings);
document.querySelector('#save-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target; const button = form.querySelector('button'); button.disabled = true;
  try {
    const data = new FormData(form);
    const input = { url: data.get('url'), tags: splitTags(String(data.get('tags'))) };
    if (data.get('title')) input.title = data.get('title');
    const document = await api('/documents', { method: 'POST', body: JSON.stringify(input) });
    form.reset(); await showDocument(document.id); await loadTags(); message('글을 저장했습니다.');
  } catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
window.addEventListener('pagehide', () => { state.generation++; main.replaceChildren(); document.querySelector('#save-form').reset(); document.querySelector('#tag-filter').replaceChildren(); message(''); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
try { await showList(); await loadTags(); } catch (error) { message(error.message, true); }
