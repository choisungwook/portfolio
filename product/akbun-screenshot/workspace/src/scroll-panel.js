'use strict';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const status = document.getElementById('status');

listen('scroll-progress', ({ payload }) => {
  const { settling, height, lost, full } = payload;
  status.classList.toggle('warn', lost || full);
  if (settling) status.textContent = 'Hold still, then scroll slowly';
  else if (full) status.textContent = `${height}px, the limit. Press Done`;
  else if (lost) status.textContent = 'Lost track, scroll back a little and slower';
  else status.textContent = `${height}px captured`;
});

document.getElementById('done').addEventListener('click', () => invoke('scroll_done'));
// Closing the panel is what cancels: the capture loop stops when it is gone.
document.getElementById('cancel').addEventListener('click', () => invoke('window_close'));
