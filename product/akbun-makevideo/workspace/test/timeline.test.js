'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/timeline.js');
const T = require('../src/time.js');

// What is left in timeline.js is the read side: what a redraw and a drag need
// between frames. Placing, moving, trimming and splitting are commands now and
// are tested in the makevideo-edit crate, which is the only thing that performs
// them. What is checked here is the half the page still answers on its own.
//
// Every project here is on the default 30, so a second is 30 frames and the
// numbers below read as frames throughout.

const VIDEO = { id: 'v', path: '/m/a.mp4', name: 'a.mp4', kind: 'video', durationMs: 10000, width: 1920, height: 1080, hasAudio: true };
const SILENT = { id: 's', path: '/m/s.mp4', name: 's.mp4', kind: 'video', durationMs: 8000, width: 1920, height: 1080, hasAudio: false };
const SOUND = { id: 'm', path: '/m/m.mp3', name: 'm.mp3', kind: 'audio', durationMs: 30000, width: 0, height: 0, hasAudio: true };
const STILL = { id: 'p', path: '/m/p.png', name: 'p.png', kind: 'image', durationMs: 0, width: 800, height: 600, hasAudio: false };

function clip(id, assetId, start, inPoint, outPoint, linkGroup) {
  return { id, assetId, start, in: inPoint, out: outPoint, volume: 1, opacity: 1, linkGroup: linkGroup || null };
}

function track(id, kind, name, clips) {
  return { id, kind, name, clips: clips || [], muted: false, hidden: false };
}

/** A document state as Rust hands it over, which is the only way the page ever
 *  gets one. */
function projectOf(assets, tracks, rate) {
  return {
    version: 2,
    settings: { width: 1920, height: 1080, rate: rate || T.fps(30) },
    assets: assets || [],
    tracks: tracks || [track('t1', 'video', 'V1'), track('t2', 'audio', 'A1')],
  };
}

test('the placeholder project is empty and on the defaults', () => {
  const project = L.blankProject();
  assert.deepStrictEqual(project.settings, { width: 1920, height: 1080, rate: T.fps(30) });
  assert.deepStrictEqual(project.tracks, []);
  assert.deepStrictEqual(project.assets, []);
});

test('a track only takes what it can play', () => {
  const video = track('t1', 'video', 'V1');
  const audio = track('t2', 'audio', 'A1');
  assert.strictEqual(L.canAccept(video, VIDEO), true);
  assert.strictEqual(L.canAccept(video, STILL), true);
  assert.strictEqual(L.canAccept(video, SOUND), false);
  // The sound of a take without its picture is a normal thing to want.
  assert.strictEqual(L.canAccept(audio, VIDEO), true);
  assert.strictEqual(L.canAccept(audio, SILENT), false);
  assert.strictEqual(L.canAccept(audio, SOUND), true);
  assert.strictEqual(L.canAccept(audio, STILL), false);
  // A lane under the pointer with nothing to drop on it.
  assert.strictEqual(L.canAccept(video, null), false);
});

test('the shortest clip is never shorter than the minimum on any rate', () => {
  // Rounding to the nearest frame would give 2 frames at 23.976, which is
  // 0.083s — under the length that was decided to be grabbable.
  for (const rate of T.STANDARD_RATES) {
    const frames = L.minClipFrames(rate);
    assert.ok(
      T.framesToSeconds(frames, rate) >= L.MIN_CLIP_SECONDS,
      `${T.rateLabel(rate)} gave ${frames} frames`
    );
  }
  assert.strictEqual(L.minClipFrames(T.ntsc(24)), 3);
  assert.strictEqual(L.minClipFrames(T.fps(30)), 3, 'a tenth of a second of 30');
});

test('a hidden track does not stretch the timeline', () => {
  const second = track('t3', 'video', 'V2', [clip('c2', 'v', 900, 0, 300)]);
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1', [clip('c1', 'v', 0, 0, 300)]), second]);
  assert.strictEqual(L.projectDurationFrames(project), 1200);
  second.hidden = true;
  assert.strictEqual(L.projectDurationFrames(project), 300);
});

test('a muted audio track drops out of the length too', () => {
  const audio = track('t2', 'audio', 'A1', [clip('c1', 'm', 0, 0, 900)]);
  const project = projectOf([SOUND], [audio]);
  assert.strictEqual(L.projectDurationFrames(project), 900);
  audio.muted = true;
  assert.strictEqual(L.projectDurationFrames(project), 0);
});

test('what is under the playhead knows which frame of the asset it is', () => {
  // A clip starting a second into the timeline and a second into the source.
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1', [clip('c1', 'v', 60, 30, 300)])]);
  const active = L.clipsAt(project, 150);
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].sourceFrame, 120);
  assert.strictEqual(L.clipsAt(project, 99999).length, 0);
  // The end frame is exclusive, so the last frame of that clip is 329.
  assert.strictEqual(L.clipsAt(project, 330).length, 0);
  assert.strictEqual(L.clipsAt(project, 329).length, 1);
});

test('the playhead snaps to the nearest edge inside the tolerance', () => {
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1', [clip('c1', 'v', 120, 0, 300)])]);
  assert.strictEqual(L.snapTime(project, 122, 5), 120, 'to a clip start');
  assert.strictEqual(L.snapTime(project, 417, 5), 420, 'to a clip end');
  assert.strictEqual(L.snapTime(project, 210, 5), 210, 'nothing nearby');
  assert.strictEqual(L.snapTime(project, 2, 5), 0, 'zero is a target');
});

test('a tolerance of zero is the magnet turned off', () => {
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1', [clip('c1', 'v', 120, 0, 300)])]);
  assert.strictEqual(L.snapTime(project, 122, 0), 122);
});

test('a dragged clip snaps by its tail as well as its head', () => {
  const project = projectOf(
    [VIDEO],
    [
      track('t1', 'video', 'V1', [clip('c1', 'v', 300, 0, 300)]),
      track('t3', 'video', 'V2', [clip('c2', 'v', 0, 0, 300)]),
    ]
  );
  // Dragging so the clip ends near the start of the other one: the tail is
  // what should stick, which means a start of 300 - 300 = 0.
  assert.strictEqual(L.snapClipStart(project, 4, 300, 6, { exceptClipId: 'c2' }), 0);
});

test('a clip is never snapped to itself', () => {
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1', [clip('c1', 'v', 120, 0, 300)])]);
  assert.strictEqual(
    L.snapClipStart(project, 122, 300, 6, { exceptClipId: 'c1' }),
    122,
    'its own edges are not targets'
  );
});

test('the playhead is a snap target when the caller passes it in', () => {
  const project = projectOf([VIDEO], [track('t1', 'video', 'V1')]);
  assert.strictEqual(L.snapTime(project, 448, 5, { extra: [450] }), 450);
  assert.strictEqual(L.snapTime(project, 448, 5, { extra: [] }), 448);
});

test('finding by id reaches into every track', () => {
  const project = projectOf(
    [VIDEO, SOUND],
    [
      track('t1', 'video', 'V1', [clip('c1', 'v', 0, 0, 300)]),
      track('t2', 'audio', 'A1', [clip('c2', 'm', 0, 0, 900)]),
    ]
  );
  assert.strictEqual(L.findClip(project, 'c2').track.id, 't2');
  assert.strictEqual(L.findClip(project, 'gone'), null);
  assert.strictEqual(L.findTrack(project, 't1').name, 'V1');
  assert.strictEqual(L.findAsset(project, 'm').kind, 'audio');
  assert.deepStrictEqual(L.tracksOf(project, 'video').map((each) => each.id), ['t1']);
});

test('linked clips and a relink candidate are found across track kinds', () => {
  const video = clip('c1', 'v', 0, 0, 300, 'g1');
  const audio = clip('c2', 'v', 0, 0, 300, 'g1');
  const project = projectOf(
    [VIDEO],
    [track('t1', 'video', 'V1', [video]), track('t2', 'audio', 'A1', [audio])]
  );
  assert.deepStrictEqual(L.linkedClips(project, 'c1').map((entry) => entry.clip.id), ['c1', 'c2']);
  assert.strictEqual(L.relinkCandidate(project, 'c1'), null, 'already linked');
  video.linkGroup = null;
  audio.linkGroup = null;
  assert.strictEqual(L.relinkCandidate(project, 'c1').clip.id, 'c2');
  audio.start = 1;
  assert.strictEqual(L.relinkCandidate(project, 'c1'), null, 'out of sync');
});

test('a project on a broadcast rate counts its own frames', () => {
  const project = projectOf(
    [VIDEO],
    [track('t1', 'video', 'V1', [clip('c1', 'v', 0, 0, 300)])],
    T.ntsc(30)
  );
  // Ten seconds of source is 300 frames of 29.97 too — those frames are just
  // each a thousandth longer.
  assert.strictEqual(L.projectDurationFrames(project), 300);
  assert.strictEqual(T.framesToMillis(300, L.rateOf(project)), 10010);
});

test('a project with no rate in it is read as 30 rather than as nothing', () => {
  assert.deepStrictEqual(L.rateOf(null), T.fps(30));
  assert.deepStrictEqual(L.rateOf({}), T.fps(30));
});

test('the clock reads in frames, which is what a two frame trim is visible in', () => {
  assert.strictEqual(L.formatTimecode(0, T.fps(30)), '0:00:00:00');
  assert.strictEqual(L.formatTimecode(109837, T.fps(30)), '1:01:01:07');
  assert.strictEqual(L.formatTimecode(-5, T.fps(30)), '0:00:00:00');
});

test('a ruler label drops the hour and the frames when they are zero', () => {
  assert.strictEqual(L.formatRulerLabel(150, T.fps(30)), '00:05');
  assert.strictEqual(L.formatRulerLabel(153, T.fps(30)), '00:05:03');
  assert.strictEqual(L.formatRulerLabel(108000, T.fps(30)), '1:00:00');
});

test('ruler ticks stay far enough apart to read at any zoom', () => {
  const rate = T.fps(30);
  for (const pxPerSecond of [2, 10, 60, 200, 800]) {
    const step = L.tickStepFrames(pxPerSecond, rate);
    assert.ok(
      L.framesToPx(step, rate, pxPerSecond) >= 70 || step === 600 * 30,
      `${pxPerSecond}px/s gave ${step} frames`
    );
  }
});

test('pixels and frames convert both ways', () => {
  const rate = T.fps(30);
  assert.strictEqual(L.framesToPx(60, rate, 50), 100);
  assert.strictEqual(L.pxToFrames(100, rate, 50), 60);
});

test('a clip with nothing left of it has no negative length', () => {
  assert.strictEqual(L.clipDuration(clip('c1', 'v', 0, 30, 10)), 0);
  assert.strictEqual(L.clipEnd(clip('c1', 'v', 100, 30, 10)), 100);
});
