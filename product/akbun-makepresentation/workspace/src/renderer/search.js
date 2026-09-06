'use strict';

const Search = globalThis.makepresentationSearch;
let deckSearchIndex = null;
let deckSearchResults = [];
let deckSearchCurrent = -1;
let deckSearchTimer;

function invalidateDeckSearch() {
  deckSearchIndex = null;
  if (!$('deck-search').hidden) scheduleDeckSearch();
}

function scheduleDeckSearch() {
  clearTimeout(deckSearchTimer);
  deckSearchTimer = setTimeout(updateDeckSearch, 80);
}

function openDeckSearch() {
  if (state.presenting) return;
  if (state.editingIndex >= 0) textEditor.blur();
  $('deck-search').hidden = false;
  updateDeckSearch();
  $('deck-search-input').focus();
  $('deck-search-input').select();
}

function closeDeckSearch() {
  clearTimeout(deckSearchTimer);
  $('deck-search').hidden = true;
  canvas.focus({ preventScroll: true });
}

function updateDeckSearch() {
  clearTimeout(deckSearchTimer);
  deckSearchTimer = null;
  deckSearchIndex ||= Search.buildSearchIndex(state.deck);
  deckSearchResults = Search.searchSlides(deckSearchIndex, $('deck-search-input').value);
  deckSearchCurrent = -1;
  renderDeckSearchResults();
}

function renderDeckSearchResults() {
  const total = deckSearchResults.length;
  $('deck-search-count').textContent = total ? `${deckSearchCurrent + 1} / ${total} objects` : 'No results';
  $('deck-search-prev').disabled = total === 0;
  $('deck-search-next').disabled = total === 0;
  const pageStart = Math.floor(Math.max(0, deckSearchCurrent) / 100) * 100;
  const fragment = document.createDocumentFragment();
  for (const [offset, entry] of deckSearchResults.slice(pageStart, pageStart + 100).entries()) {
    const index = pageStart + offset;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.result = index;
    button.classList.toggle('active', index === deckSearchCurrent);
    button.textContent = `Slide ${entry.slideIndex + 1} · ${entry.text.replace(/\s+/g, ' ').slice(0, 160)}`;
    fragment.append(button);
  }
  $('deck-search-results').replaceChildren(fragment);
}

function selectDeckSearchResult(index) {
  if (deckSearchIndex === null) updateDeckSearch();
  if (!deckSearchResults.length) return;
  deckSearchCurrent = (index + deckSearchResults.length) % deckSearchResults.length;
  const entry = deckSearchResults[deckSearchCurrent];
  state.current = entry.slideIndex;
  setSlideSelection([state.current]);
  selectOnly(entry.shapeIndex);
  setTool('select');
  renderAll();
  renderDeckSearchResults();
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.scrollIntoView({ block: 'nearest' });
  canvas.querySelector(`[data-i="${entry.shapeIndex}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
  $('deck-search-results').querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function stepDeckSearch(step) {
  if (deckSearchTimer || deckSearchIndex === null) updateDeckSearch();
  selectDeckSearchResult(deckSearchCurrent < 0 && step < 0 ? deckSearchResults.length - 1 : deckSearchCurrent + step);
}

$('deck-search-input').addEventListener('input', scheduleDeckSearch);
$('deck-search-close').addEventListener('click', closeDeckSearch);
$('deck-search-prev').addEventListener('click', () => stepDeckSearch(-1));
$('deck-search-next').addEventListener('click', () => stepDeckSearch(1));
$('deck-search-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-result]');
  if (button) selectDeckSearchResult(Number(button.dataset.result));
});
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]') || state.presenting) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openDeckSearch();
  } else if (!$('deck-search').hidden && event.key === 'Escape') {
    event.preventDefault();
    closeDeckSearch();
  } else if ($('deck-search').contains(event.target) && event.key === 'Enter') {
    event.preventDefault();
    if (deckSearchTimer) updateDeckSearch();
    stepDeckSearch(event.shiftKey ? -1 : 1);
  }
});
