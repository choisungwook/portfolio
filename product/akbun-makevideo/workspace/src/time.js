'use strict';

// Time, expressed once, as a count of frames on a rate. The page half of the
// makevideo-time crate; the two have to agree because the project file passes
// between them, so the tests on both sides check the same rates.
//
// A rate is two integers, because 29.97 is 30000/1001 and a decimal is an
// approximation of it. A time is a value counted in units of 1/rate seconds,
// which for the project rate means the value simply is the frame index: no
// division, so nothing to round.
//
// Everything on the timeline is on the project rate, so adding and comparing
// two of its times is plain integer arithmetic and does not need a function.
// What does need one is anything that crosses a boundary — milliseconds from
// ffprobe, seconds from a media element, another rate — and that is all here.

const AUDIO_HZ = 48000;

function gcd(a, b) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    const next = left % right;
    left = right;
    right = next;
  }
  return Math.max(1, left);
}

/** Reduced on the way in, so 60000/2002 and 30000/1001 are one rate. Anything
 *  unusable falls back to 30: a project file that says nothing sensible should
 *  still open. */
function rate(num, den) {
  const top = Math.round(Number(num));
  const bottom = Math.round(Number(den));
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= 0 || bottom <= 0) {
    return { num: 30, den: 1 };
  }
  const divisor = gcd(top, bottom);
  return { num: top / divisor, den: bottom / divisor };
}

function fps(frames) {
  return rate(frames, 1);
}

/** The NTSC relative of a whole rate, which is that rate times 1000/1001. */
function ntsc(frames) {
  return rate(frames * 1000, 1001);
}

/** Every rate the app offers, in the order the picker shows them. */
const STANDARD_RATES = [ntsc(24), fps(24), fps(25), ntsc(30), fps(30), fps(50), ntsc(60), fps(60)];

function rateToNumber(value) {
  return value.num / value.den;
}

function sameRate(a, b) {
  return a.num === b.num && a.den === b.den;
}

/** "30" or "29.97", the way people write it. */
function rateLabel(value) {
  if (value.den === 1) return String(value.num);
  return rateToNumber(value)
    .toFixed(3)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}

/** "30000/1001" for a file or a filter argument, "30" when the denominator is
 *  1. This is the form that stays exact. */
function rateRatio(value) {
  return value.den === 1 ? String(value.num) : `${value.num}/${value.den}`;
}

/** The standard rate a decimal was meant to be. A project file that says 29.97
 *  meant 30000/1001, and believing the decimal is how the approximation gets
 *  back in. */
function nearestRate(value) {
  const wanted = Number(value);
  if (!Number.isFinite(wanted) || wanted <= 0) return fps(30);
  for (const candidate of STANDARD_RATES) {
    if (Math.abs(rateToNumber(candidate) - wanted) < 0.005) return candidate;
  }
  return rate(Math.round(wanted * 1000), 1000);
}

/** "30", "30000/1001" or "29.97". */
function parseRate(text) {
  const value = String(text).trim();
  if (value.includes('/')) {
    const [num, den] = value.split('/');
    return rate(Number(num), Number(den));
  }
  return nearestRate(Number(value));
}

/** Rounded half away from zero, which is what keeps a conversion and its
 *  inverse symmetric either side of zero. */
function divRound(num, den) {
  return num >= 0 ? Math.round(num / den) : -Math.round(-num / den);
}

// --- conversion ------------------------------------------------------------

/** The way in from anything that still measures in milliseconds: an ffprobe
 *  duration, a media element that reported one. */
function framesFromMillis(millis, value) {
  return divRound(millis * value.num, value.den * 1000);
}

/** Rounded, and only for the places that still speak milliseconds. Nothing
 *  that decides where a frame goes may go through here. */
function framesToMillis(frames, value) {
  return divRound(frames * value.den * 1000, value.num);
}

function framesToSeconds(frames, value) {
  return (frames * value.den) / value.num;
}

/** A media element's currentTime is seconds and moves continuously, so this
 *  keeps the fraction. Round it yourself when a frame index is wanted. */
function secondsToFrames(seconds, value) {
  return (seconds * value.num) / value.den;
}

function framesToSamples(frames, value, hz) {
  return divRound(frames * value.den * (hz || AUDIO_HZ), value.num);
}

// --- rescale, add, subtract, compare, clamp --------------------------------

/** The same instant counted on another rate, rounded to the nearest whole
 *  frame of it. Exact whenever the rates divide. */
function rescale(frames, from, to) {
  if (sameRate(from, to)) return frames;
  return divRound(frames * from.den * to.num, from.num * to.den);
}

/** A value and the rate it is counted in, for the few places that hold times
 *  from two rates at once — mainly changing the project rate. Within the
 *  timeline everything is on the project rate and these are not needed. */
function time(value, rateOf) {
  return { value, rate: rateOf };
}

/** Answers on the left hand rate, because that is the one the caller is
 *  working in. */
function add(a, b) {
  return time(a.value + rescale(b.value, b.rate, a.rate), a.rate);
}

function sub(a, b) {
  return time(a.value - rescale(b.value, b.rate, a.rate), a.rate);
}

/** Negative, zero or positive, comparing the instants rather than the counts:
 *  frame 1 of 30 and frame 2 of 60 are the same moment. */
function compare(a, b) {
  const left = a.value * a.rate.den * b.rate.num;
  const right = b.value * b.rate.den * a.rate.num;
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Held between two bounds and answered on this time's own rate. */
function clamp(value, low, high) {
  const lowest = rescale(low.value, low.rate, value.rate);
  const highest = Math.max(lowest, rescale(high.value, high.rate, value.rate));
  return time(Math.min(Math.max(value.value, lowest), highest), value.rate);
}

// --- reading a time --------------------------------------------------------

/** h:mm:ss:ff, non drop frame: the frames field counts to the rate rounded up,
 *  so 29.97 shows 30 frames a second the way every deck does. That makes the
 *  timecode run slightly behind the wall clock on an NTSC rate, which is the
 *  bargain non drop timecode has always been. */
function formatTimecode(frames, value) {
  const perSecond = Math.max(1, Math.round(rateToNumber(value)));
  const whole = Math.max(0, Math.round(frames));
  const seconds = Math.floor(whole / perSecond);
  const pad = (number) => String(number).padStart(2, '0');
  return [
    Math.floor(seconds / 3600),
    pad(Math.floor((seconds % 3600) / 60)),
    pad(seconds % 60),
    pad(whole % perSecond),
  ].join(':');
}

const exported = {
  AUDIO_HZ,
  STANDARD_RATES,
  rate,
  fps,
  ntsc,
  rateToNumber,
  sameRate,
  rateLabel,
  rateRatio,
  nearestRate,
  parseRate,
  framesFromMillis,
  framesToMillis,
  framesToSeconds,
  secondsToFrames,
  framesToSamples,
  rescale,
  time,
  add,
  sub,
  compare,
  clamp,
  formatTimecode,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.timeLib = exported;
}
