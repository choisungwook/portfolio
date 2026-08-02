'use strict';

// Arithmetic the page does on its own: timecodes, meter scales, device labels,
// and turning a waveform of any length into the columns that fit the canvas.
//
// None of it touches the DOM or the bridge, so node can test all of it. The
// drawing in renderer.js is then only a loop over what these functions return.
//
// Everything is inside a function because a script tag makes a file's top level
// names globals on the page. Without this, renderer.js destructuring the
// exports fails with "Identifier has already been declared" and the page is
// blank, which is a runtime error no test over this file would catch.
(function () {

// The bottom of the level meters, matching MIN_DB in the recorder crate. Both
// sides have to agree or the bar and the number under it disagree.
const MIN_DB = -60;

/// mm:ss.mmm. The milliseconds are there because a podcast edit is cut on a
/// breath, and tenths are not enough to say which breath.
function formatTimecode(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const millis = Math.floor((rest - whole) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// mm:ss, for the marks along the timeline. The transport gets milliseconds
// because it is one number being read; a ruler of them is unreadable noise.
function formatClock(seconds) {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = Math.round(safe - minutes * 60);
  if (rest === 60) return `${String(minutes + 1).padStart(2, '0')}:00`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

// The second marks inside a visible window, as absolute times in the take.
//
// They are whole multiples of the interval rather than offsets from the left
// edge, because while recording the window scrolls: offsets would label the
// ruler 00:06.962, 00:07.962 and move every frame.
function timelineTicks(startSeconds, secondsAcross, interval) {
  if (!(secondsAcross > 0) || !(interval > 0)) return [];
  const start = Number.isFinite(startSeconds) ? startSeconds : 0;
  const end = start + secondsAcross;
  const ticks = [];
  for (let step = Math.floor(start / interval) + 1; step * interval < end; step += 1) {
    ticks.push(step * interval);
  }
  return ticks;
}

// Linear amplitude to dBFS, floored so silence is a number and not -Infinity.
function toDb(level) {
  if (!Number.isFinite(level) || level <= 0) return MIN_DB;
  return Math.max(MIN_DB, 20 * Math.log10(level));
}

// Where a level sits on a MIN_DB to 0 dB meter, as 0 to 1.
function meterFraction(level) {
  const fraction = (toDb(level) - MIN_DB) / -MIN_DB;
  return Math.min(1, Math.max(0, fraction));
}

// The number under a meter. Silence reads as a floor rather than "-Infinity".
function formatDb(level) {
  const db = toDb(level);
  if (db <= MIN_DB) return `${MIN_DB} dB`;
  return `${db.toFixed(1)} dB`;
}

function sampleRateLabel(hertz) {
  if (!Number.isFinite(hertz) || hertz <= 0) return '';
  const kilohertz = hertz / 1000;
  const rounded = Number.isInteger(kilohertz) ? kilohertz : kilohertz.toFixed(1);
  return `${rounded} kHz`;
}

// One line in the device list. The channel count matters: it is how the user
// tells a two input interface from the laptop microphone next to it.
function deviceLabel(device) {
  if (!device) return '';
  const parts = [device.name || 'Unknown device'];
  if (device.channels) parts.push(`${device.channels} ch`);
  const rate = sampleRateLabel(device.sampleRate);
  if (rate) parts.push(rate);
  const label = parts.join(' · ');
  return device.isDefault ? `${label} (system default)` : label;
}

// Which device the list should show as chosen.
//
// A stored id that is no longer present falls back to the system default,
// because that is what the backend will actually open. Showing the missing
// device as selected would tell the user their unplugged interface is live.
function selectedDeviceId(devices, storedId) {
  if (!Array.isArray(devices) || devices.length === 0) return '';
  const stored = devices.find((device) => device.id === storedId);
  if (stored) return stored.id;
  const fallback = devices.find((device) => device.isDefault) || devices[0];
  return fallback.id;
}

// How many waveform columns fit across the canvas.
function columnCount(width, columnWidth) {
  if (!(width > 0) || !(columnWidth > 0)) return 0;
  return Math.floor(width / columnWidth);
}

// While recording, the view is the tail of the take: columns arrive at a fixed
// width and the newest one is always at the right edge. Scrolling the past out
// of view is what makes the indicator appear to travel the timeline.
function tailView(peaks, columns) {
  if (!Array.isArray(peaks) || columns <= 0) return { first: 0, values: [] };
  const first = Math.max(0, peaks.length - columns);
  return { first, values: peaks.slice(first) };
}

// When the take is finished the whole thing is shown at once, so the columns
// are aggregated rather than dropped. Taking the maximum of each group keeps a
// short loud sound visible in a long take, which is exactly what an average
// would erase.
function fitPeaks(peaks, columns) {
  if (!Array.isArray(peaks) || peaks.length === 0 || columns <= 0) return [];
  if (peaks.length <= columns) return peaks.slice();
  const step = peaks.length / columns;
  const values = [];
  for (let column = 0; column < columns; column += 1) {
    const start = Math.floor(column * step);
    const end = Math.min(peaks.length, Math.floor((column + 1) * step));
    let loudest = 0;
    for (let index = start; index < Math.max(end, start + 1); index += 1) {
      const value = peaks[index] || 0;
      if (value > loudest) loudest = value;
    }
    values.push(loudest);
  }
  return values;
}

// Seconds covered by a number of waveform columns.
function secondsOfPeaks(count, sampleRate, framesPerPeak) {
  if (!(sampleRate > 0) || !(framesPerPeak > 0)) return 0;
  return (count * framesPerPeak) / sampleRate;
}

// Where the playhead sits, as 0 to 1 across the drawn waveform.
//
// A take of zero length puts it at the start rather than dividing by zero, and
// a position past the end is clamped so the line cannot leave the canvas.
function playheadFraction(seconds, totalSeconds) {
  if (!(totalSeconds > 0) || !Number.isFinite(seconds)) return 0;
  return Math.min(1, Math.max(0, seconds / totalSeconds));
}

const exported = {
  MIN_DB,
  formatTimecode,
  formatClock,
  timelineTicks,
  toDb,
  meterFraction,
  formatDb,
  sampleRateLabel,
  deviceLabel,
  selectedDeviceId,
  columnCount,
  tailView,
  fitPeaks,
  secondsOfPeaks,
  playheadFraction,
};

// Loaded twice: as a script tag on the page and through require in the tests.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.makepodcastMeters = exported;
}

})();
