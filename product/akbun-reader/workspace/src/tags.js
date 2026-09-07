import { action, api, backButton, beginView, documentItem, emptyState, heading, main, message, node, pager, state, views } from './ui.js';
import { shareControls } from './shares.js';

async function renameTag(name) {
  const next = prompt(`'${name}' 태그의 새 이름`, name);
  if (next === null) return null;
  const trimmed = next.trim();
  if (!trimmed || trimmed === name) return null;
  const result = await api(`/tags/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) });
  message(`'${name}' 태그를 '${result.name}'(으)로 바꿨습니다.`);
  return result.name;
}

async function deleteTag(name) {
  if (!confirm(`'${name}' 태그를 모든 글에서 지울까요? 글은 남고 태그만 사라집니다.`)) return false;
  await api(`/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
  message(`'${name}' 태그를 지웠습니다.`);
  return true;
}

export async function showTags() {
  const generation = beginView('태그를 불러오는 중…');
  const result = await api('/tags');
  if (generation !== state.generation) return;
  const content = node('div', undefined, 'settings');
  content.append(heading('태그'));
  const search = node('input'); search.type = 'search'; search.placeholder = '태그 이름으로 찾기';
  const label = node('label', '검색'); label.append(search);
  const list = node('ul', undefined, 'tag-list');
  function render() {
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const tag of result.tags.filter(tag => !query || tag.name.toLowerCase().includes(query))) {
      const item = node('li');
      const open = action(node('button', undefined, 'tag-name'), () => views.tag(tag.name));
      open.append(node('strong', tag.name), node('span', ` ${tag.count}개`, 'meta'));
      const buttons = node('div', undefined, 'toolbar');
      buttons.append(action(node('button', '이름 변경'), async () => { if (await renameTag(tag.name)) await showTags(); }));
      buttons.append(action(node('button', '삭제'), async () => { if (await deleteTag(tag.name)) await showTags(); }));
      item.append(open, buttons); list.append(item);
    }
    if (!list.children.length) list.append(emptyState('태그가 없어요', query ? '다른 검색어로 찾아보세요.' : '글을 저장할 때 태그를 붙이면 여기에 모입니다.'));
  }
  search.addEventListener('input', render);
  render();
  content.append(label, list);
  main.replaceChildren(backButton(), content); main.focus();
}

export async function showTagView(name) {
  const generation = beginView('글을 불러오는 중…');
  const load = offset => api(`/documents?${new URLSearchParams({ location: 'all', tag: name, offset: String(offset ?? 0) })}`);
  const [result, share] = await Promise.all([load(0), shareControls('tag', name)]);
  if (generation !== state.generation) return;
  const title = heading(`#${name}`);
  const buttons = node('div', undefined, 'toolbar');
  buttons.append(action(node('button', '이름 변경'), async () => { const next = await renameTag(name); if (next) await showTagView(next); }));
  buttons.append(action(node('button', '삭제'), async () => { if (await deleteTag(name)) await showTags(); }));
  title.append(buttons);
  const list = node('ul', undefined, 'document-list');
  const append = page => { for (const document of page.documents) list.append(documentItem(document)); };
  append(result);
  main.replaceChildren(backButton('태그 목록', showTags), title, share, list);
  if (!result.documents.length) main.append(emptyState('이 태그가 붙은 글이 없어요', '태그 목록으로 돌아가 다른 태그를 골라보세요.'));
  main.append(pager(generation, result, load, append)); main.focus();
}

views.tags = showTags;
views.tag = showTagView;
