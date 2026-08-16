'use strict';

function renderPresent() {
  const { width, height } = deckSize();
  present.innerHTML = L.renderSlideSvg(state.deck.slides[state.presentIndex], {
    width,
    height,
    number: state.showNumbers ? state.presentIndex + 1 : 0,
  });
}

let presentationOwnsFullscreen = false;

async function enterPresent() {
  if (state.presenting) return;
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
  const leaveFullscreen = presentationOwnsFullscreen;
  presentationOwnsFullscreen = false;
  if (restoreWindow && leaveFullscreen) {
    try {
      await window.api.setFullscreen(false);
    } catch (_) {}
  }
}

function presentStep(direction) {
  const next = state.presentIndex + direction;
  if (next < 0 || next >= state.deck.slides.length) return;
  state.presentIndex = next;
  renderPresent();
}

present.addEventListener('click', () => presentStep(1));
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
