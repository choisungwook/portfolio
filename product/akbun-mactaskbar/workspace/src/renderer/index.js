'use strict';

const itemsEl = document.getElementById('items');
const statusEl = document.getElementById('status');
const filterEl = document.getElementById('filter');
const stateEl = document.getElementById('state');

let items = [];

function render() {
  const query = filterEl.value.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      item.app.toLowerCase().includes(query) || item.label.toLowerCase().includes(query)
  );

  itemsEl.replaceChildren(
    ...shown.map((item) => {
      const li = document.createElement('li');
      li.className = item.visible ? '' : 'off';
      const name = document.createElement('span');
      name.textContent = item.label === item.app ? item.app : `${item.app} — ${item.label}`;
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = item.visible ? `x ${item.x}` : 'off screen';
      li.append(name, pos);
      return li;
    })
  );

  const hidden = items.filter((item) => !item.visible).length;
  statusEl.textContent = `${shown.length} of ${items.length} items, ${hidden} off screen`;
}

async function rescan() {
  statusEl.textContent = 'Scanning…';
  items = await window.api.listItems();
  render();
}

document.getElementById('refresh').addEventListener('click', rescan);
filterEl.addEventListener('input', render);

document.getElementById('cycle').addEventListener('click', async () => {
  stateEl.textContent = await window.api.cycleState();
  // The bar needs a moment to settle before the new positions can be read.
  setTimeout(rescan, 400);
});

window.api.onState((state) => {
  stateEl.textContent = state;
});

window.api.getState().then((state) => {
  stateEl.textContent = state;
});

rescan();
