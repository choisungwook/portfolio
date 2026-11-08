'use strict';

// Tells the capture thread the still is on screen, so the selection starts
// over a frozen display rather than the live one.
(async () => {
  const { invoke } = window.__TAURI__.core;
  const { emit } = window.__TAURI__.event;
  const still = document.getElementById('still');
  try {
    still.src = await invoke('freeze_image');
    await still.decode();
  } finally {
    await emit('freeze-ready');
  }
})();
