import { channels, remaining } from './channels.js';
import { posts } from './mock.js';
import { monthGrid, overallStatus, queueOrder } from './schedule.js';

const screens = { compose: '작성', queue: '대기열', calendar: '캘린더' };
const statusLabel = { draft: '초안', scheduled: '예약', publishing: '발행중', published: '발행됨', failed: '실패' };
const main = /** @type {HTMLElement} */ (document.getElementById('main'));
const nav = /** @type {HTMLElement} */ (document.getElementById('screens'));
const timeFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** @param {string} tag @param {Record<string, unknown>} [props] @param {(Node | string)[]} [children] */
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), /** @type {EventListener} */ (value));
    else node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

/** @param {string} status */
function pill(status, text = statusLabel[/** @type {keyof statusLabel} */ (status)] ?? status) {
  return el('span', { class: `pill ${status}` }, [text]);
}

function compose() {
  const selected = new Set(['x', 'linkedin', 'threads']);
  const body = /** @type {HTMLTextAreaElement} */ (el('textarea', { rows: 8, placeholder: '공통 본문을 쓰면 채널마다 남은 글자 수가 갱신돼요.' }));
  const counters = el('ul', { class: 'counters' });
  const render = () => {
    counters.replaceChildren(...channels.map(item => {
      const left = remaining(body.value, item.id);
      const on = selected.has(item.id);
      return el('li', { class: on ? (left < 0 ? 'over' : '') : 'off' }, [
        el('label', {}, [
          el('input', { type: 'checkbox', ...(on ? { checked: '' } : {}), onchange: () => { on ? selected.delete(item.id) : selected.add(item.id); render(); } }),
          item.name,
        ]),
        el('span', {}, [on ? `${left}자 남음` : '제외', item.imageRequired ? ' · 이미지 필수' : '']),
      ]);
    }));
  };
  body.addEventListener('input', render);
  render();
  return el('section', { class: 'compose' }, [
    el('div', { class: 'heading' }, [el('h1', {}, ['글 작성']), el('span', { class: 'hint' }, ['채널별 덧쓰기와 저장은 다음 단계'])]),
    el('div', { class: 'compose-grid' }, [
      el('div', {}, [el('h2', {}, ['공통 본문']), body]),
      el('div', {}, [el('h2', {}, ['채널']), counters]),
    ]),
    el('div', { class: 'toolbar' }, [
      el('label', { class: 'inline' }, ['발행 시각', el('input', { type: 'datetime-local' })]),
      el('button', { class: 'primary', type: 'button', disabled: '' }, ['예약']),
      el('button', { type: 'button', disabled: '' }, ['초안 저장']),
    ]),
  ]);
}

function queue() {
  const list = el('ol', { class: 'queue' }, queueOrder(posts).map(post => el('li', { class: 'post' }, [
    el('div', { class: 'post-head' }, [
      pill(overallStatus(post)),
      el('span', { class: 'meta' }, [post.scheduledAt ? timeFormat.format(new Date(post.scheduledAt)) : '시각 미정']),
    ]),
    el('p', {}, [post.body]),
    el('div', { class: 'pills' }, Object.entries(post.channels).map(([id, status]) =>
      pill(status, `${channels.find(item => item.id === id)?.name ?? id} · ${statusLabel[/** @type {keyof statusLabel} */ (status)]}`))),
  ])));
  return el('section', {}, [
    el('div', { class: 'heading' }, [el('h1', {}, ['발행 대기열']), el('span', { class: 'hint' }, ['예약 시각 순, 시각 없는 초안은 맨 끝'])]),
    list,
  ]);
}

function calendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const cells = monthGrid(year, month, posts);
  const grid = el('div', { class: 'grid' }, [
    ...['월', '화', '수', '목', '금', '토', '일'].map(day => el('div', { class: 'weekday' }, [day])),
    ...cells.map(cell => el('div', { class: cell.inMonth ? 'cell' : 'cell outside' }, [
      el('span', { class: 'day' }, [String(cell.day)]),
      ...cell.posts.map(post => el('button', { type: 'button', class: `event ${overallStatus(post)}`, title: post.body }, [
        `${new Date(post.scheduledAt ?? 0).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ${post.body.slice(0, 18)}`,
      ])),
    ])),
  ]);
  return el('section', {}, [
    el('div', { class: 'heading' }, [el('h1', {}, [`${year}년 ${month}월`]), el('span', { class: 'hint' }, ['월요일 시작, 기기 시간대로 표시'])]),
    grid,
  ]);
}

const render = { compose, queue, calendar };

function route() {
  const key = /** @type {keyof screens} */ (location.hash.slice(1) || 'compose');
  const screen = key in render ? key : 'compose';
  for (const button of nav.querySelectorAll('button')) {
    button.toggleAttribute('aria-current', button.dataset.screen === screen);
  }
  main.replaceChildren(render[screen]());
}

nav.replaceChildren(...Object.entries(screens).map(([key, label]) =>
  el('button', { type: 'button', 'data-screen': key, onclick: () => { location.hash = key; } }, [label])));
window.addEventListener('hashchange', route);
route();
