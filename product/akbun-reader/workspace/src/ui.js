export const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
export const locations = { inbox: '받은 글', later: '나중에', archive: '보관한 글' };
export const state = { location: 'inbox', tag: '', generation: 0 };
/** 화면 전환 함수 등록. 모듈 간 순환 import를 피하기 위해 호출 시점에 찾는다. */
export const views = {};

/** @param {string} tag @param {string} [content] @param {string} [className] */
export function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
}

export function message(content, error = false) {
  notice.textContent = content;
  notice.className = error ? 'error' : '';
}

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    cache: 'no-store', credentials: 'same-origin', ...options,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (response.status === 401 || response.status === 403) {
    state.generation++;
    main.replaceChildren(node('h1', '로그인이 필요합니다'), node('p', '페이지를 새로고침해 다시 로그인하세요.'));
    document.querySelector('#tag-filter').replaceChildren(new Option('모든 태그', ''));
    document.querySelector('#save-form').reset();
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('응답을 읽지 못했습니다. 페이지를 새로고침해 로그인 상태를 확인하세요.'); }
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data;
}

export function action(button, callback) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await callback(); } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  return button;
}

export function heading(title) {
  const row = node('div', undefined, 'heading');
  row.append(node('h1', title));
  return row;
}

export function link(text, href) {
  const anchor = node('a', text);
  anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  return anchor;
}

export function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

export function hostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

export function splitTags(value) { return [...new Set(value.split(',').map(tag => tag.trim()).filter(Boolean))]; }

export function backButton(label = '목록으로', callback = () => views.list()) {
  return action(node('button', label), callback);
}

/** 목록 화면과 태그 화면이 같이 쓰는 문서 항목 */
export function documentItem(document) {
  const item = node('li');
  const button = action(node('button', undefined, 'document'), () => views.document(document.id));
  button.append(node('h2', document.title));
  button.append(node('span', `${hostname(document.normalized_url)} / ${document.is_read ? '읽음' : '안 읽음'}`, 'meta'));
  item.append(button);
  if (document.tags.length) {
    const pills = node('div', undefined, 'pills');
    for (const tag of document.tags) pills.append(action(node('button', tag, 'pill'), () => views.tag(tag)));
    item.append(pills);
  }
  return item;
}

/** 50개 단위 목록에 더 보기 버튼을 붙인다. loadPage(offset)가 next_offset을 포함한 페이지를 돌려준다. */
export function pager(generation, first, loadPage, appendItems) {
  let next = first.next_offset;
  const more = action(node('button', '더 보기', 'more'), async () => {
    const page = await loadPage(next);
    if (generation !== state.generation) return;
    appendItems(page); next = page.next_offset; more.hidden = next === null;
  });
  more.hidden = next === null;
  return more;
}

export function emptyState(title, description) {
  const empty = node('div', undefined, 'empty');
  empty.append(node('h2', title), node('p', description));
  return empty;
}

export function beginView(loadingText, reading = true) {
  const generation = ++state.generation;
  document.body.classList.toggle('reading', reading);
  main.replaceChildren(node('p', loadingText));
  return generation;
}
