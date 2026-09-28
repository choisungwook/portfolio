'use strict';

// View state that exists only while presenting. None of it is part of the
// deck, and entering the presentation starts it fresh.
const presentView = { blank: '', laser: false, jump: '', overview: false, overviewIndex: 0 };
const presentSlide = $('present-slide');
const presentOverview = $('present-overview');

function renderPresent() {
  const { width, height } = deckSize();
  presentSlide.innerHTML = L.renderSlideSvg(state.deck.slides[state.presentIndex], {
    width,
    height,
    number: state.showNumbers ? state.presentIndex + 1 : 0,
  });
  renderPresentChrome();
}

function renderPresentChrome() {
  const blank = $('present-blank');
  blank.hidden = !presentView.blank;
  blank.dataset.color = presentView.blank;
  const jump = $('present-jump');
  jump.hidden = !presentView.jump;
  jump.textContent = presentView.jump;
  present.classList.toggle('laser', presentView.laser);
  present.classList.toggle('overview', presentView.overview);
  presentOverview.hidden = !presentView.overview;
}

let presentationOwnsFullscreen = false;

async function enterPresent() {
  if (state.presenting) return;
  Object.assign(presentView, { blank: '', laser: false, jump: '', overview: false });
  state.presenting = true;
  state.presentIndex = state.current;
  present.hidden = false;
  renderPresent();
  try {
    await window.api.setFullscreen(true);
    presentationOwnsFullscreen = true;
  } catch (error) {
    state.presenting = false;
    present.hidden = true;
    await window.api.message(String(error), {
      title: 'Cannot start presentation',
      kind: 'error',
    });
  }
}

async function exitPresent(restoreWindow = true) {
  if (!state.presenting) return;
  state.presenting = false;
  present.hidden = true;
  presentOverview.innerHTML = '';
  const leaveFullscreen = presentationOwnsFullscreen;
  presentationOwnsFullscreen = false;
  if (restoreWindow && leaveFullscreen) {
    try {
      await window.api.setFullscreen(false);
    } catch (_) {}
  }
}

function presentGo(index) {
  const next = Math.max(0, Math.min(state.deck.slides.length - 1, index));
  if (next === state.presentIndex) return;
  state.presentIndex = next;
  renderPresent();
}

function presentStep(direction) {
  presentGo(state.presentIndex + direction);
}

// --- overview grid ------------------------------------------------------------

function openOverview() {
  const { width, height } = deckSize();
  presentOverview.innerHTML = state.deck.slides
    .map((s, i) =>
      `<button type="button" data-index="${i}">${L.renderSlideSvg(s, { width, height, number: 0 })}` +
      `<span>${i + 1}</span></button>`)
    .join('');
  presentView.overview = true;
  presentView.overviewIndex = state.presentIndex;
  markOverview();
}

function closeOverview(index) {
  presentView.overview = false;
  presentOverview.innerHTML = '';
  if (index === undefined) renderPresentChrome();
  else {
    presentGo(index);
    renderPresentChrome();
  }
}

function markOverview() {
  renderPresentChrome();
  for (const button of presentOverview.children) {
    button.classList.toggle('current', Number(button.dataset.index) === presentView.overviewIndex);
  }
  presentOverview.children[presentView.overviewIndex]?.scrollIntoView({ block: 'nearest' });
}

function overviewColumns() {
  return getComputedStyle(presentOverview).gridTemplateColumns.split(' ').length || 1;
}

function overviewKey(key) {
  const last = state.deck.slides.length - 1;
  const moves = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: overviewColumns(),
    ArrowUp: -overviewColumns(),
  };
  if (key in moves) {
    presentView.overviewIndex = Math.max(0, Math.min(last, presentView.overviewIndex + moves[key]));
    markOverview();
  } else if (key === 'Home' || key === 'End') {
    presentView.overviewIndex = key === 'Home' ? 0 : last;
    markOverview();
  } else if (key === 'Enter' || key === ' ') {
    closeOverview(presentView.overviewIndex);
  } else if (key === 'Escape' || key.toLowerCase() === 'o') {
    closeOverview();
  }
}

presentOverview.addEventListener('click', (event) => {
  event.stopPropagation();
  const button = event.target.closest('[data-index]');
  if (button) closeOverview(Number(button.dataset.index));
});

// --- keyboard -------------------------------------------------------------------

// Every key reaches here while presenting, and none of them leaks into the
// editor shortcuts. Digits build a slide number that Enter jumps to; any
// other key throws the half-typed number away.
function presentKey(event) {
  const { key } = event;
  if (presentView.overview) {
    overviewKey(key);
    return;
  }
  if (/^[0-9]$/.test(key)) {
    presentView.jump = (presentView.jump + key).slice(-4);
    renderPresentChrome();
    return;
  }
  if (presentView.jump && key === 'Backspace') {
    presentView.jump = presentView.jump.slice(0, -1);
    renderPresentChrome();
    return;
  }
  const jump = presentView.jump;
  presentView.jump = '';
  if (jump && key === 'Enter') {
    presentGo(Number(jump) - 1);
    renderPresentChrome();
    return;
  }
  const letter = key.length === 1 ? key.toLowerCase() : '';
  if (key === 'Escape') {
    exitPresent();
    return;
  }
  // A blanked screen comes back on the next key without also moving on,
  // so the audience sees the slide they left rather than the one after it.
  if (presentView.blank && letter !== 'b' && letter !== 'w') {
    presentView.blank = '';
  } else if (letter === 'b' || letter === 'w') {
    const color = letter === 'b' ? 'black' : 'white';
    presentView.blank = presentView.blank === color ? '' : color;
  } else if (letter === 'l') {
    presentView.laser = !presentView.laser;
  } else if (letter === 'o') {
    openOverview();
    return;
  } else if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(key)) {
    presentStep(1);
  } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(key)) {
    presentStep(-1);
  } else if (key === 'Home') {
    presentGo(0);
  } else if (key === 'End') {
    presentGo(state.deck.slides.length - 1);
  }
  renderPresentChrome();
}

present.addEventListener('click', () => {
  if (presentView.blank) {
    presentView.blank = '';
    renderPresentChrome();
  } else {
    presentStep(1);
  }
});

present.addEventListener('pointermove', (event) => {
  if (!presentView.laser) return;
  $('present-laser').style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
});
window.api.onFullscreenChanged((fullscreen) => {
  if (fullscreen && state.presenting) {
    presentationOwnsFullscreen = true;
  } else if (!fullscreen && state.presenting && presentationOwnsFullscreen) {
    exitPresent(false);
  }
});

window.api.onGuidelinesChanged((enabled) => {
  state.showGuidelines = enabled;
  renderCanvas();
});

// --- toolbar and application menu ------------------------------------------------------------------

// Every menu item, by the data-command in the markup. The keyboard shortcuts
// call the same functions, so a command cannot behave one way from the menu
// and another from the key.
