import { action, api, backButton, beginView, emptyState, heading, main, message, node, state, views } from './ui.js';

const kinds = { tag: '태그', feed: 'RSS' };

export function shareUrl(share) { return `${location.origin}/public/${share.id}`; }

async function copy(text) {
  try { await navigator.clipboard.writeText(text); message('공개 링크를 복사했습니다.'); }
  catch { message('복사하지 못했습니다. 링크를 직접 선택해 복사하세요.', true); }
}

/** 태그·RSS 화면에서 쓰는 공개 링크 영역. 링크가 있으면 주소와 해제 버튼을 보여준다. */
export async function shareControls(kind, target) {
  const box = node('div', undefined, 'share');
  const result = await api('/shares');
  let share = result.shares.find(row => row.kind === kind && row.target === target) ?? null;
  function render() {
    box.replaceChildren();
    if (!share) {
      box.append(node('span', '아무나 볼 수 있는 링크를 만들 수 있습니다. 본문은 공개되지 않습니다.', 'meta'));
      box.append(action(node('button', '공개 링크 만들기'), async () => {
        share = await api('/shares', { method: 'POST', body: JSON.stringify({ kind, target }) });
        render(); message('공개 링크를 만들었습니다.');
      }));
      return;
    }
    const url = shareUrl(share);
    const open = node('a', '열기'); open.href = url; open.target = '_blank'; open.rel = 'noopener noreferrer';
    box.append(node('code', url, 'share-url'), open, action(node('button', '복사'), () => copy(url)), action(node('button', '공개 해제'), async () => {
      await api(`/shares/${share.id}`, { method: 'DELETE' }); share = null; render(); message('공개 링크를 삭제했습니다.');
    }));
  }
  render();
  return box;
}

export async function showShares() {
  const generation = beginView('공개 링크를 불러오는 중…');
  const result = await api('/shares');
  if (generation !== state.generation) return;
  const content = node('div', undefined, 'settings');
  content.append(heading('공개 링크'));
  content.append(node('p', '링크를 아는 사람은 누구나 목록을 볼 수 있습니다. 삭제하면 그 즉시 열리지 않습니다.'));
  const list = node('ul', undefined, 'share-list');
  const empty = () => emptyState('공개 링크가 없어요', '태그나 RSS 화면에서 공개 링크를 만들 수 있습니다.');
  for (const share of result.shares) {
    const item = node('li');
    const title = node('div');
    title.append(node('span', kinds[share.kind], 'pill'), node('strong', ` ${share.title}`));
    const url = shareUrl(share);
    const buttons = node('div', undefined, 'toolbar');
    buttons.append(action(node('button', '보기'), () => share.kind === 'tag' ? views.tag(share.target) : views.feedItems(share.target)));
    buttons.append(action(node('button', '복사'), () => copy(url)));
    buttons.append(action(node('button', '삭제'), async () => {
      if (!confirm(`${share.title} 공개 링크를 삭제할까요? 링크를 가진 사람은 더 이상 볼 수 없습니다.`)) return;
      await api(`/shares/${share.id}`, { method: 'DELETE' }); item.remove(); message('공개 링크를 삭제했습니다.');
      if (!list.children.length) content.append(empty());
    }));
    item.append(title, node('code', url, 'share-url'), buttons); list.append(item);
  }
  content.append(list);
  if (!result.shares.length) content.append(empty());
  main.replaceChildren(backButton(), content); main.focus();
}

views.shares = showShares;
