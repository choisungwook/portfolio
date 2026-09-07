import { action, api, backButton, beginView, dateText, emptyState, heading, hostname, link, main, message, node, pager, state, views } from './ui.js';
import { shareControls } from './shares.js';

const statuses = { pending: '아직 가져오지 않음', done: '정상', failed: '가져오기 실패' };

function itemElement(item) {
  const element = node('li', undefined, 'feed-item');
  const title = node('h2'); title.append(link(item.title, item.normalized_url)); element.append(title);
  element.append(node('span', [item.feed_title, hostname(item.normalized_url), dateText(item.published_at)].filter(Boolean).join(' / '), 'meta'));
  if (item.summary) element.append(node('p', item.summary, 'feed-summary'));
  const buttons = node('div', undefined, 'toolbar');
  if (item.document_id) buttons.append(action(node('button', '보관함에서 열기'), () => views.document(item.document_id)));
  else buttons.append(action(node('button', '보관함에 저장'), async () => {
    const document = await api('/documents', { method: 'POST', body: JSON.stringify({ url: item.normalized_url, title: item.title }) });
    item.document_id = document.id; message('보관함에 저장했습니다. 본문은 잠시 후 준비됩니다.');
    element.replaceWith(itemElement(item));
  }));
  element.append(buttons);
  return element;
}

function itemList(generation, first, load) {
  const list = node('ul', undefined, 'document-list');
  const append = page => { for (const item of page.items) list.append(itemElement(item)); };
  append(first);
  return { list, more: pager(generation, first, load, append) };
}

export async function showFeeds() {
  const generation = beginView('RSS를 불러오는 중…');
  const load = offset => api(`/feed-items?${new URLSearchParams({ offset: String(offset ?? 0) })}`);
  const [result, items] = await Promise.all([api('/feeds'), load(0)]);
  if (generation !== state.generation) return;
  const content = node('div', undefined, 'settings');
  content.append(heading('RSS'));
  const form = node('form'); form.append(node('h2', 'RSS 등록'));
  const urlLabel = node('label', 'RSS 주소'); const url = node('input'); url.type = 'url'; url.required = true; url.placeholder = 'https://'; url.maxLength = 4000; urlLabel.append(url);
  const nameLabel = node('label', '이름 '); nameLabel.append(node('span', '(선택, 비우면 피드 제목)')); const name = node('input'); name.maxLength = 200; nameLabel.append(name);
  const submit = node('button', '등록', 'primary'); submit.type = 'submit';
  form.append(urlLabel, nameLabel, submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const input = { url: url.value };
      if (name.value.trim()) input.title = name.value.trim();
      await api('/feeds', { method: 'POST', body: JSON.stringify(input) });
      message('RSS를 등록했습니다. 글은 잠시 후 수집됩니다.'); await showFeeds();
    } catch (error) { message(error.message, true); } finally { submit.disabled = false; }
  });
  const register = node('section'); register.append(form); content.append(register);
  const feeds = node('section'); feeds.append(node('h2', '구독 중인 RSS'));
  const list = node('ul', undefined, 'tag-list');
  for (const feed of result.feeds) {
    const item = node('li');
    const open = action(node('button', undefined, 'tag-name'), () => showFeedItems(feed.id));
    open.append(node('strong', feed.title), node('span', ` ${feed.item_count}개 · ${statuses[feed.fetch_status] ?? feed.fetch_status}${feed.fetched_at ? ` · ${dateText(feed.fetched_at)}` : ''}`, 'meta'));
    const buttons = node('div', undefined, 'toolbar');
    buttons.append(action(node('button', '지금 가져오기'), async () => {
      const refreshed = await api(`/feeds/${feed.id}/refresh`, { method: 'POST' });
      message(refreshed.fetch_status === 'done' ? `새 글 ${refreshed.added}개를 가져왔습니다.` : 'RSS를 가져오지 못했습니다. 주소와 형식을 확인하세요.', refreshed.fetch_status !== 'done');
      await showFeeds();
    }));
    buttons.append(action(node('button', '삭제'), async () => {
      if (!confirm(`${feed.title} RSS와 수집된 글을 삭제할까요? 보관함에 저장한 글은 남습니다.`)) return;
      await api(`/feeds/${feed.id}`, { method: 'DELETE' }); message('RSS를 삭제했습니다.'); await showFeeds();
    }));
    item.append(open, node('span', feed.url, 'meta'), buttons); list.append(item);
  }
  feeds.append(list);
  if (!result.feeds.length) feeds.append(emptyState('구독 중인 RSS가 없어요', '위에서 RSS 주소를 등록하면 15분마다 새 글을 가져옵니다.'));
  content.append(feeds);
  const recent = node('section'); recent.append(node('h2', '최근 수집된 글'));
  const { list: itemsList, more } = itemList(generation, items, load);
  recent.append(itemsList);
  if (!items.items.length) recent.append(emptyState('수집된 글이 없어요', 'RSS를 등록한 뒤 잠시 기다리거나 지금 가져오기를 누르세요.'));
  recent.append(more); content.append(recent);
  main.replaceChildren(backButton(), content); main.focus();
}

export async function showFeedItems(feedId) {
  const generation = beginView('글을 불러오는 중…');
  const load = offset => api(`/feed-items?${new URLSearchParams({ feed: feedId, offset: String(offset ?? 0) })}`);
  const [feed, result, share] = await Promise.all([api(`/feeds/${feedId}`), load(0), shareControls('feed', feedId)]);
  if (generation !== state.generation) return;
  const { list, more } = itemList(generation, result, load);
  main.replaceChildren(backButton('RSS 목록', showFeeds), heading(feed.title), node('p', feed.url, 'meta'), share, list);
  if (!result.items.length) main.append(emptyState('수집된 글이 없어요', 'RSS 목록에서 지금 가져오기를 누르세요.'));
  main.append(more); main.focus();
}

views.feeds = showFeeds;
views.feedItems = showFeedItems;
