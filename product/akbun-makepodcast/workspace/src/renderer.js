'use strict';

// The page. It holds one copy of the state the backend last returned, redraws
// from it, and keeps a single array of waveform columns for the take in track A.
//
// The columns are the only thing that does not come from a snapshot. They
// arrive one poll at a time while recording and are appended, because sending
// the whole waveform thirty times a second would grow with the take.

const {
  formatTimecode,
  formatClock,
  timelineTicks,
  meterFraction,
  formatDb,
  deviceLabel,
  selectedDeviceId,
  columnCount,
  tailView,
  fitPeaks,
  secondsOfPeaks,
  playheadFraction,
} = globalThis.makepodcastMeters;

// One column is two pixels of bar and one of gap. Narrower turns speech into a
// solid block; wider and a minute of audio no longer fits across the window.
const COLUMN_WIDTH = 3;

const element = (id) => document.getElementById(id);

const ui = {
  version: element('version'),
  projectName: element('project-name'),
  takeName: element('take-name'),
  trackSource: element('track-source'),
  canvas: element('waveform'),
  playhead: element('playhead'),
  record: element('record'),
  stop: element('stop'),
  play: element('play'),
  timecode: element('timecode'),
  status: element('status'),
  inputDevice: element('input-device'),
  outputDevice: element('output-device'),
  inputMeter: element('input-meter'),
  outputMeter: element('output-meter'),
  inputDb: element('input-db'),
  outputDb: element('output-db'),
  inputClip: element('input-clip'),
  volume: element('volume'),
  volumeValue: element('volume-value'),
  projectDir: element('project-dir'),
  projectDialog: element('project-dialog'),
  projectInput: element('project-input'),
  settingsDialog: element('settings-dialog'),
  settingsDir: element('settings-dir'),
  settingsFile: element('settings-file'),
  settingsVersion: element('settings-version'),
};

const context = ui.canvas.getContext('2d');

const state = {
  snapshot: null,
  // Columns for the take being recorded or the take just finished.
  peaks: [],
  sampleRate: 48000,
  framesPerPeak: 512,
  seconds: 0,
  playSeconds: 0,
  // How wide the waveform actually is, which is not the canvas width for a
  // take too short to fill it. The playhead needs it to land on the audio.
  drawnWidth: 0,
};

function status() {
  return state.snapshot ? state.snapshot.status : 'idle';
}

// The canvas is sized in device pixels and scaled back down, so a waveform on
// a retina display is not four soft pixels per column.
function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = ui.canvas.clientWidth;
  const height = ui.canvas.clientHeight;
  if (width === 0 || height === 0) return;
  ui.canvas.width = Math.round(width * ratio);
  ui.canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawWaveform();
}

// Reading a custom property means a style resolution, and the waveform is
// redrawn thirty times a second. They are read once and again when the system
// switches theme, which is the only thing that changes them.
const colors = {};

function readColors() {
  const style = getComputedStyle(document.documentElement);
  for (const name of ['--grid', '--fg-dim', '--wave']) {
    colors[name] = style.getPropertyValue(name).trim();
  }
}

// Second markers. The interval grows with the length of the take so the labels
// never collide, which is the whole reason the list is walked instead of
// drawing a line per second.
function tickInterval(secondsAcross, width) {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const candidate of candidates) {
    if ((candidate / secondsAcross) * width >= 70) return candidate;
  }
  return candidates[candidates.length - 1];
}

function drawWaveform() {
  const width = ui.canvas.clientWidth;
  const height = ui.canvas.clientHeight;
  if (width === 0 || height === 0) return;

  context.clearRect(0, 0, width, height);
  const middle = height / 2;
  const columns = columnCount(width, COLUMN_WIDTH);

  // Recording follows the head at a fixed column width, so the waveform
  // travels the timeline. A finished take is fitted, so the whole thing is
  // visible without scrolling.
  const recording = status() === 'recording';
  const values = recording
    ? tailView(state.peaks, columns).values
    : fitPeaks(state.peaks, columns);

  // A take too short to fill the canvas keeps the recording column width
  // rather than being stretched across the window, which would draw a two
  // second take as a handful of bars a hundred pixels wide.
  const step = !recording && values.length >= columns && columns > 0
    ? width / values.length
    : COLUMN_WIDTH;
  const drawnWidth = Math.max(1, values.length * step);
  state.drawnWidth = recording ? width : drawnWidth;

  // While recording the view scrolls, so the left edge is not time zero.
  const secondsAcross = recording
    ? secondsOfPeaks(columns, state.sampleRate, state.framesPerPeak)
    : Math.max(state.seconds, 0.001);
  const startSeconds = recording ? Math.max(0, state.seconds - secondsAcross) : 0;
  const axisWidth = recording ? width : drawnWidth;

  context.strokeStyle = colors['--grid'];
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, Math.round(middle) + 0.5);
  context.lineTo(width, Math.round(middle) + 0.5);
  context.stroke();

  const interval = tickInterval(secondsAcross, axisWidth);
  context.fillStyle = colors['--fg-dim'];
  context.font = '10px ui-monospace, Menlo, Consolas, monospace';
  for (const mark of timelineTicks(startSeconds, secondsAcross, interval)) {
    const x = Math.round(((mark - startSeconds) / secondsAcross) * axisWidth) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.fillText(formatClock(mark), x + 4, 12);
  }

  context.fillStyle = colors['--wave'];
  const barWidth = Math.max(1, step - 1);
  for (let index = 0; index < values.length; index += 1) {
    const amplitude = Math.min(1, Math.max(0, values[index] || 0));
    const barHeight = Math.max(1, amplitude * (height - 4));
    context.fillRect(index * step, middle - barHeight / 2, barWidth, barHeight);
  }
}

function drawPlayhead() {
  const width = ui.canvas.clientWidth;
  if (width === 0) {
    ui.playhead.hidden = true;
    return;
  }
  if (status() === 'recording') {
    const columns = columnCount(width, COLUMN_WIDTH);
    const drawn = Math.min(state.peaks.length, columns);
    ui.playhead.hidden = false;
    ui.playhead.style.left = `${Math.min(width, drawn * COLUMN_WIDTH)}px`;
    return;
  }
  if (status() === 'playing' && state.seconds > 0) {
    ui.playhead.hidden = false;
    const fraction = playheadFraction(state.playSeconds, state.seconds);
    ui.playhead.style.left = `${fraction * (state.drawnWidth || width)}px`;
    return;
  }
  ui.playhead.hidden = true;
}

function setMeter(bar, label, level) {
  bar.style.width = `${meterFraction(level) * 100}%`;
  label.textContent = formatDb(level);
}

function fillDevices(select, devices, storedId) {
  const chosen = selectedDeviceId(devices, storedId);
  select.replaceChildren();
  if (devices.length === 0) {
    const option = document.createElement('option');
    option.textContent = 'No device found';
    option.value = '';
    select.append(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const device of devices) {
    const option = document.createElement('option');
    option.value = device.id;
    option.textContent = deviceLabel(device);
    option.selected = device.id === chosen;
    select.append(option);
  }
}

function render(snapshot) {
  if (snapshot) state.snapshot = snapshot;
  const current = state.snapshot;
  if (!current) return;

  ui.version.textContent = `v${current.version}`;
  ui.settingsVersion.textContent = current.version;
  ui.projectName.textContent = current.project ? current.project.name : 'No project';
  ui.takeName.textContent = current.take ? current.take.name : '';
  ui.projectDir.textContent = current.project ? current.project.dir : current.projectDir;
  ui.settingsDir.textContent = current.projectDir;
  ui.settingsFile.textContent = `${current.appDir}/settings.json`;

  fillDevices(ui.inputDevice, current.devices.inputs, current.settings.inputDevice);
  fillDevices(ui.outputDevice, current.devices.outputs, current.settings.outputDevice);

  const input = current.devices.inputs.find((device) => device.id === ui.inputDevice.value);
  ui.trackSource.textContent = current.recording
    ? `${current.recording.device} · ${current.recording.channels} ch`
    : input
      ? deviceLabel(input)
      : '—';

  // The format capture actually opened with, not the one the list advertises.
  // The ruler is built from it, so assuming a rate would put every mark out by
  // the difference between it and the interface's.
  if (current.recording) {
    state.sampleRate = current.recording.sampleRate;
    state.framesPerPeak = current.recording.framesPerPeak;
  }

  ui.volume.value = String(Math.round((current.settings.volume ?? 1) * 100));
  ui.volumeValue.textContent = `${ui.volume.value}%`;

  const recording = current.status === 'recording';
  const playing = current.status === 'playing';
  ui.record.classList.toggle('armed', recording);
  ui.record.disabled = recording;
  ui.stop.disabled = !recording && !playing;
  ui.play.disabled = !current.take || recording || playing;
  ui.status.textContent = recording ? 'Recording' : playing ? 'Playing' : 'Idle';

  // A take loaded from a snapshot rather than from the live poll: adopt its
  // waveform so a redraw after a resize shows the take and not an empty canvas.
  if (!recording && current.take) {
    state.peaks = current.take.peaks;
    state.sampleRate = current.take.sampleRate;
    state.framesPerPeak = current.take.framesPerPeak;
    state.seconds = current.take.seconds;
  }
  if (!current.take && !recording) {
    state.peaks = [];
    state.seconds = 0;
  }

  ui.timecode.textContent = formatTimecode(playing ? state.playSeconds : state.seconds);
  drawWaveform();
  drawPlayhead();
}

window.api.onChange(render);

window.api.onCapture((update) => {
  if (update.peaks.length > 0) state.peaks.push(...update.peaks);
  state.seconds = update.seconds;
  setMeter(ui.inputMeter, ui.inputDb, update.meter.rms);
  ui.inputClip.hidden = !update.clipped;
  ui.timecode.textContent = formatTimecode(update.seconds);
  drawWaveform();
  drawPlayhead();
});

window.api.onPlayback((update) => {
  state.playSeconds = update.seconds;
  setMeter(ui.outputMeter, ui.outputDb, update.meter.rms);
  ui.timecode.textContent = formatTimecode(update.seconds);
  drawPlayhead();
  if (update.finished) {
    state.playSeconds = 0;
    setMeter(ui.outputMeter, ui.outputDb, 0);
    // The engine stopped itself at the end of the take, so ask for the state
    // rather than assuming what it now is.
    window.api.getState().then(render);
  }
});

async function saveSettings(patch) {
  const settings = { ...state.snapshot.settings, ...patch };
  await window.api.saveSettings(settings);
}

ui.record.addEventListener('click', async () => {
  state.peaks = [];
  state.seconds = 0;
  state.playSeconds = 0;
  ui.inputClip.hidden = true;
  setMeter(ui.inputMeter, ui.inputDb, 0);
  await window.api.startRecording();
});

ui.stop.addEventListener('click', async () => {
  if (status() === 'recording') {
    await window.api.stopRecording();
    setMeter(ui.inputMeter, ui.inputDb, 0);
  } else {
    await window.api.stopPlayback();
    state.playSeconds = 0;
    setMeter(ui.outputMeter, ui.outputDb, 0);
  }
});

ui.play.addEventListener('click', async () => {
  state.playSeconds = 0;
  await window.api.startPlayback();
});

ui.inputDevice.addEventListener('change', () => saveSettings({ inputDevice: ui.inputDevice.value }));
ui.outputDevice.addEventListener('change', () =>
  saveSettings({ outputDevice: ui.outputDevice.value })
);

// Two handlers on the slider: input updates the number while dragging and
// change writes the file once, so a drag is not a hundred writes to disk.
ui.volume.addEventListener('input', () => {
  ui.volumeValue.textContent = `${ui.volume.value}%`;
});
ui.volume.addEventListener('change', () =>
  saveSettings({ volume: Number(ui.volume.value) / 100 })
);

element('refresh-devices').addEventListener('click', () => window.api.refreshDevices());
element('open-dir').addEventListener('click', () => window.api.openProjectDir());

element('menu-new').addEventListener('click', () => {
  ui.projectInput.value = '';
  ui.projectDialog.showModal();
  ui.projectInput.focus();
});

ui.projectDialog.addEventListener('close', async () => {
  if (ui.projectDialog.returnValue !== 'create') return;
  const name = ui.projectInput.value.trim();
  if (!name) return;
  state.peaks = [];
  state.seconds = 0;
  await window.api.newProject(name);
});

element('menu-save').addEventListener('click', async () => {
  const current = state.snapshot;
  if (!current || !current.take) return;
  await window.api.saveWav(current.take.name);
});

element('menu-settings').addEventListener('click', () => ui.settingsDialog.showModal());

element('settings-change').addEventListener('click', async (event) => {
  event.preventDefault();
  const picked = await window.api.pickFolder(state.snapshot.projectDir);
  if (picked) await saveSettings({ projectDir: picked });
});

element('settings-reset').addEventListener('click', async (event) => {
  event.preventDefault();
  await saveSettings({ projectDir: '' });
});

element('settings-update').addEventListener('click', (event) => {
  event.preventDefault();
  window.api.checkUpdate();
});

element('menu-close').addEventListener('click', async () => {
  if (status() === 'recording') {
    const leave = await window.api.confirm(
      'A recording is running. Close anyway and lose what has not been written yet?',
      'Close'
    );
    if (!leave) return;
  }
  window.api.close();
});

window.addEventListener('resize', resizeCanvas);

// The stylesheet answers the system theme on its own, but the canvas is drawn
// with values copied out of it, so those copies have to be taken again.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  readColors();
  drawWaveform();
});

readColors();
window.api.getState().then((snapshot) => {
  render(snapshot);
  resizeCanvas();
});
