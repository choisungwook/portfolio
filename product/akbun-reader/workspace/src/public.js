const main = document.querySelector('#main');
const id = location.pathname.match(/^\/public\/([a-f0-9]{32})$/)?.[1];

/** @param {string} tag @param {string} [content] @param {string} [className] */
function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
}

function hostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ko-KR');
}

async function load(offset) {
  const response = await fetch(`/public/${id}/data?offset=${offset}`, { cache: 'no-store' });
  if (response.status === 404) throw new Error('공개 링크가 없거나 삭제되었습니다.');
  if (!response.ok) throw new Error('목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  return response.json();
}

function item(kind, entry) {
  const element = node('li', undefined, 'feed-item');
  const title = node('h2');
  const anchor = node('a', entry.title); anchor.href = entry.normalized_url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  title.append(anchor); element.append(title);
  element.append(node('span', `${hostname(entry.normalized_url)} / ${dateText(kind === 'feed' ? entry.published_at : entry.created_at)}`, 'meta'));
  if (kind === 'feed' && entry.summary) element.append(node('p', entry.summary, 'feed-summary'));
  if (kind === 'tag' && entry.summary.length) {
    const lines = node('ul', undefined, 'public-summary');
    for (const line of entry.summary) lines.append(node('li', line));
    element.append(lines);
  }
  return element;
}

try {
  if (!id) throw new Error('공개 링크가 없거나 삭제되었습니다.');
  const first = await load(0);
  document.title = `${first.title} · akbun reader`;
  const heading = node('div', undefined, 'heading');
  heading.append(node('h1', first.kind === 'tag' ? `#${first.title}` : first.title));
  const list = node('ul', undefined, 'document-list');
  const append = page => { for (const entry of page.items) list.append(item(first.kind, entry)); };
  append(first);
  main.replaceChildren(heading, node('p', first.kind === 'tag' ? '이 태그가 붙은 글의 제목과 원문 링크입니다.' : 'RSS에서 수집한 글의 제목과 원문 링크입니다.', 'meta'), list);
  if (!first.items.length) main.append(node('p', '아직 글이 없습니다.', 'empty'));
  let next = first.next_offset;
  const more = node('button', '더 보기', 'more');
  more.hidden = next === null;
  more.addEventListener('click', async () => {
    more.disabled = true;
    try { const page = await load(next); append(page); next = page.next_offset; more.hidden = next === null; }
    catch (error) { main.append(node('p', error.message, 'error')); }
    finally { more.disabled = false; }
  });
  main.append(more);
} catch (error) {
  main.replaceChildren(node('h1', '볼 수 없는 링크'), node('p', error.message));
}
