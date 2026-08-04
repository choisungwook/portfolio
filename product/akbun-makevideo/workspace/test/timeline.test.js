'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/timeline.js');
const T = require('../src/time.js');

// Every project here is on the default 30, so a second is 30 frames and the
// numbers below read as frames throughout. The rates that cannot be counted in
// whole milliseconds have their own tests at the end.
function projectWith(assets) {
  const project = L.createProject();
  L.addAssets(project, assets);
  return project;
}

const VIDEO = { id: 'v', path: '/m/a.mp4', name: 'a.mp4', kind: 'video', durationMs: 10000, width: 1920, height: 1080, hasAudio: true };
const SILENT = { id: 's', path: '/m/s.mp4', name: 's.mp4', kind: 'video', durationMs: 8000, width: 1920, height: 1080, hasAudio: false };
const SOUND = { id: 'm', path: '/m/m.mp3', name: 'm.mp3', kind: 'audio', durationMs: 30000, width: 0, height: 0, hasAudio: true };
const STILL = { id: 'p', path: '/m/p.png', name: 'p.png', kind: 'image', durationMs: 0, width: 800, height: 600, hasAudio: false };

function videoTrack(project, index) {
  return L.tracksOf(project, 'video')[index || 0];
}

function audioTrack(project, index) {
  return L.tracksOf(project, 'audio')[index || 0];
}

test('a new project starts with one video and one audio track', () => {
  const project = L.createProject();
  assert.deepStrictEqual(
    project.tracks.map((track) => track.name),
    ['V1', 'A1']
  );
  assert.deepStrictEqual(project.settings, { width: 1920, height: 1080, rate: T.fps(30) });
  assert.strictEqual(project.version, L.FORMAT_VERSION);
});

test('tracks stop at four of each kind', () => {
  const project = L.createProject();
  for (let index = 0; index < 3; index += 1) {
    assert.ok(L.addTrack(project, 'video'), `video track ${index + 2}`);
    assert.ok(L.addTrack(project, 'audio'), `audio track ${index + 2}`);
  }
  assert.strictEqual(L.addTrack(project, 'video'), null);
  assert.strictEqual(L.addTrack(project, 'audio'), null);
  assert.deepStrictEqual(
    L.tracksOf(project, 'video').map((track) => track.name),
    ['V1', 'V2', 'V3', 'V4']
  );
});

test('only the last track of a kind can be removed, and never the only one', () => {
  const project = L.createProject();
  const first = videoTrack(project);
  assert.strictEqual(L.removeTrack(project, first.id), false, 'the only video track stays');
  const second = L.addTrack(project, 'video');
  const third = L.addTrack(project, 'video');
  // Removing V2 while V3 exists would leave V1 and V3 named out of step.
  assert.strictEqual(L.removeTrack(project, second.id), false);
  assert.strictEqual(L.removeTrack(project, third.id), true);
  assert.strictEqual(L.tracksOf(project, 'video').length, 2);
});

test('a track only takes what it can play', () => {
  const project = projectWith([VIDEO, SILENT, SOUND, STILL]);
  const video = videoTrack(project);
  const audio = audioTrack(project);
  assert.strictEqual(L.canAccept(video, VIDEO), true);
  assert.strictEqual(L.canAccept(video, STILL), true);
  assert.strictEqual(L.canAccept(video, SOUND), false);
  // The sound of a take without its picture is a normal thing to want.
  assert.strictEqual(L.canAccept(audio, VIDEO), true);
  assert.strictEqual(L.canAccept(audio, SILENT), false);
  assert.strictEqual(L.canAccept(audio, SOUND), true);
  assert.strictEqual(L.canAccept(audio, STILL), false);
});

test('a clip lands where it was dropped', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 75);
  assert.strictEqual(clip.start, 75);
  assert.strictEqual(clip.in, 0);
  assert.strictEqual(clip.out, 300, 'ten seconds of source is 300 frames of 30');
});

test('an asset the track cannot play is refused rather than half added', () => {
  const project = projectWith([SOUND]);
  assert.strictEqual(L.addClip(project, videoTrack(project).id, 'm', 0), null);
  assert.strictEqual(videoTrack(project).clips.length, 0);
});

test('a still gets a default length because it has none of its own', () => {
  const project = projectWith([STILL]);
  const clip = L.addClip(project, videoTrack(project).id, 'p', 0);
  assert.strictEqual(L.clipDuration(clip), L.DEFAULT_IMAGE_SECONDS * 30);
});

test('a clip dropped on top of another is pushed past it', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 0);
  const second = L.addClip(project, track.id, 'v', 120);
  assert.strictEqual(second.start, 300, 'lands after the first clip ends');
});

test('a drop into a gap too small for it keeps walking right', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  // Two clips back to back, then a drop aimed at the seam between them.
  L.addClip(project, track.id, 'v', 0);
  L.addClip(project, track.id, 'v', 300);
  const third = L.addClip(project, track.id, 'v', 270);
  assert.strictEqual(third.start, 600);
});

test('moving a clip inside its track does not collide with itself', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 0);
  L.moveClip(project, clip.id, track.id, 90);
  assert.strictEqual(clip.start, 90);
});

test('a clip moved to another track leaves the first one', () => {
  const project = projectWith([VIDEO]);
  const from = videoTrack(project);
  const to = L.addTrack(project, 'video');
  const clip = L.addClip(project, from.id, 'v', 30);
  L.moveClip(project, clip.id, to.id, 30);
  assert.strictEqual(from.clips.length, 0);
  assert.strictEqual(to.clips.length, 1);
});

test('a move onto a track that cannot play the asset changes nothing', () => {
  const project = projectWith([SILENT]);
  const video = videoTrack(project);
  const audio = audioTrack(project);
  const clip = L.addClip(project, video.id, 's', 0);
  assert.strictEqual(L.moveClip(project, clip.id, audio.id, 0), null);
  assert.strictEqual(video.clips.length, 1);
  assert.strictEqual(audio.clips.length, 0);
});

test('trimming the start moves the in point so the frame under the cursor stays', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 150);
  L.trimClip(project, clip.id, 'start', 210);
  assert.strictEqual(clip.start, 210);
  assert.strictEqual(clip.in, 60);
  assert.strictEqual(clip.out, 300);
});

test('the start cannot be dragged past the beginning of the source', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 150);
  L.trimClip(project, clip.id, 'start', 0);
  // The source has nothing before frame 0, so the clip stops at 150 - 0.
  assert.strictEqual(clip.start, 150);
  assert.strictEqual(clip.in, 0);
});

test('the end cannot be dragged past the end of the source', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 0);
  L.trimClip(project, clip.id, 'start', 90);
  L.trimClip(project, clip.id, 'end', 999999);
  assert.strictEqual(clip.out, 300, 'stops at the source duration');
  assert.strictEqual(L.clipEnd(clip), 300);
});

test('a trim will not shrink a clip below the minimum', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 0);
  L.trimClip(project, clip.id, 'end', 1);
  assert.strictEqual(L.clipDuration(clip), L.minClipFrames(T.fps(30)));
  assert.strictEqual(L.minClipFrames(T.fps(30)), 3, 'a tenth of a second of 30');
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
});

test('splitting cuts every clip the playhead crosses', () => {
  const project = projectWith([VIDEO, SOUND]);
  const video = videoTrack(project);
  const audio = audioTrack(project);
  L.addClip(project, video.id, 'v', 0);
  L.addClip(project, audio.id, 'm', 0);
  const created = L.splitAt(project, 120);
  assert.strictEqual(created.length, 2);
  assert.strictEqual(video.clips.length, 2);
  assert.strictEqual(audio.clips.length, 2);
});

test('splitting with a clip selected leaves the others whole', () => {
  const project = projectWith([VIDEO, SOUND]);
  const video = videoTrack(project);
  const audio = audioTrack(project);
  const target = L.addClip(project, video.id, 'v', 0);
  L.addClip(project, audio.id, 'm', 0);
  L.splitAt(project, 120, target.id);
  assert.strictEqual(video.clips.length, 2);
  assert.strictEqual(audio.clips.length, 1);
});

test('the two halves of a split are continuous in the source', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 60);
  const wasEnd = L.clipEnd(clip);
  L.splitAt(project, 150);
  const [left, right] = track.clips;
  assert.strictEqual(left.out, right.in, 'no frames lost or repeated at the cut');
  assert.strictEqual(L.clipEnd(left), right.start, 'no gap at the cut');
  assert.strictEqual(right.start, 150);
  assert.strictEqual(L.clipEnd(right), wasEnd, 'the tail still ends where it did');
  assert.strictEqual(L.projectDurationFrames(project), 360, 'the timeline is the same length');
});

test('splitting on an edge or inside a sliver does nothing', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 30);
  assert.strictEqual(L.splitAt(project, 30).length, 0, 'the clip start is not a cut');
  assert.strictEqual(L.splitAt(project, 330).length, 0, 'the clip end is not a cut');
  assert.strictEqual(L.splitAt(project, 31).length, 0, 'would leave a one frame sliver');
  assert.strictEqual(track.clips.length, 1);
});

test('a hidden track does not stretch the timeline', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const second = L.addTrack(project, 'video');
  L.addClip(project, track.id, 'v', 0);
  L.addClip(project, second.id, 'v', 900);
  assert.strictEqual(L.projectDurationFrames(project), 1200);
  second.hidden = true;
  assert.strictEqual(L.projectDurationFrames(project), 300);
});

test('a muted audio track drops out of the length too', () => {
  const project = projectWith([SOUND]);
  const audio = audioTrack(project);
  L.addClip(project, audio.id, 'm', 0);
  assert.strictEqual(L.projectDurationFrames(project), 900);
  audio.muted = true;
  assert.strictEqual(L.projectDurationFrames(project), 0);
});

test('what is under the playhead knows which frame of the asset it is', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 60);
  L.trimClip(project, clip.id, 'start', 90);
  const active = L.clipsAt(project, 150);
  assert.strictEqual(active.length, 1);
  // Two seconds into the clip, which starts a second into the source.
  assert.strictEqual(active[0].sourceFrame, 90);
  assert.strictEqual(L.clipsAt(project, 99999).length, 0);
});

test('the playhead snaps to the nearest edge inside the tolerance', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 120);
  assert.strictEqual(L.snapTime(project, 122, 5), 120, 'to a clip start');
  assert.strictEqual(L.snapTime(project, 417, 5), 420, 'to a clip end');
  assert.strictEqual(L.snapTime(project, 210, 5), 210, 'nothing nearby');
  assert.strictEqual(L.snapTime(project, 2, 5), 0, 'zero is a target');
});

test('a tolerance of zero is the magnet turned off', () => {
  const project = projectWith([VIDEO]);
  L.addClip(project, videoTrack(project).id, 'v', 120);
  assert.strictEqual(L.snapTime(project, 122, 0), 122);
});

test('a dragged clip snaps by its tail as well as its head', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const first = L.addClip(project, track.id, 'v', 300);
  const second = L.addTrack(project, 'video');
  const moving = L.addClip(project, second.id, 'v', 0);
  // Dragging so the clip ends near the start of the other one: the tail is
  // what should stick, which means a start of 300 - 300 = 0.
  const start = L.snapClipStart(project, 4, 300, 6, { exceptClipId: moving.id });
  assert.strictEqual(start, 0);
  assert.strictEqual(first.start, 300);
});

test('a clip is never snapped to itself', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 120);
  const start = L.snapClipStart(project, 122, 300, 6, { exceptClipId: clip.id });
  assert.strictEqual(start, 122, 'its own edges are not targets');
});

test('a project read back from disk does not reuse its own ids', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 0);
  const reopened = L.normalize(JSON.parse(JSON.stringify(project)));
  const fresh = L.addClip(reopened, reopened.tracks[0].id, 'v', 600);
  const ids = reopened.tracks.flatMap((each) => each.clips.map((clip) => clip.id));
  assert.strictEqual(new Set(ids).size, ids.length, `duplicate id in ${ids.join(',')}`);
  assert.ok(fresh);
});

test('a millisecond project file opens as frames', () => {
  // What version 1 wrote. Nothing downstream should have to know it existed.
  const restored = L.normalize({
    version: 1,
    settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      {
        id: 't1',
        kind: 'video',
        name: 'V1',
        clips: [{ id: 'c1', assetId: 'v', startMs: 2000, inMs: 1000, outMs: 4000 }],
      },
    ],
  });
  const clip = restored.tracks[0].clips[0];
  assert.strictEqual(restored.version, L.FORMAT_VERSION);
  assert.deepStrictEqual(restored.settings.rate, T.fps(30));
  assert.deepStrictEqual([clip.start, clip.in, clip.out], [60, 30, 120]);
  // And the millisecond keys are gone rather than riding along into the file
  // the next save writes.
  assert.strictEqual('startMs' in clip, false);
});

test('a millisecond file that says 29.97 opens on 30000/1001', () => {
  const restored = L.normalize({
    version: 1,
    settings: { width: 1920, height: 1080, fps: 29.97 },
    tracks: [
      { id: 't1', kind: 'video', name: 'V1', clips: [{ id: 'c1', assetId: 'v', startMs: 1001, inMs: 0, outMs: 1001 }] },
    ],
  });
  assert.deepStrictEqual(restored.settings.rate, T.ntsc(30));
  assert.strictEqual(restored.tracks[0].clips[0].start, 30, '1001ms of 29.97 is exactly 30 frames');
});

test('normalize fills in what an older project file did not have', () => {
  const restored = L.normalize({
    tracks: [{ id: 't1', kind: 'video', name: 'V1', clips: [{ id: 'c1', assetId: 'v', start: 0, in: 0, out: 30 }] }],
  });
  assert.strictEqual(restored.tracks[0].clips[0].volume, 1);
  assert.strictEqual(restored.tracks[0].clips[0].opacity, 1);
  assert.deepStrictEqual(restored.settings, { width: 1920, height: 1080, rate: T.fps(30) });
  assert.deepStrictEqual(restored.assets, []);
});

test('an empty project file still opens with tracks to work on', () => {
  const restored = L.normalize({});
  assert.deepStrictEqual(restored.tracks.map((track) => track.name), ['V1', 'A1']);
});

test('changing the rate carries the edit with it instead of the frame numbers', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 30);
  L.retime(project, T.fps(60));
  assert.deepStrictEqual(project.settings.rate, T.fps(60));
  // One second in, ten seconds long, on both rates.
  assert.strictEqual(clip.start, 60);
  assert.strictEqual(L.clipDuration(clip), 600);
  // And back again, which 30 and 60 can do exactly.
  L.retime(project, T.fps(30));
  assert.strictEqual(clip.start, 30);
  assert.strictEqual(L.clipDuration(clip), 300);
});

test('a project on a broadcast rate counts its own frames', () => {
  const project = L.createProject({ rate: T.ntsc(30) });
  L.addAssets(project, [VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 0);
  // Ten seconds of source is 300 frames of 29.97 too — those frames are just
  // each a thousandth longer.
  assert.strictEqual(L.clipDuration(clip), 300);
  assert.strictEqual(L.projectDurationFrames(project), 300);
  assert.strictEqual(T.framesToMillis(300, project.settings.rate), 10010);
});

test('removing an asset takes its clips with it', () => {
  const project = projectWith([VIDEO, SOUND]);
  L.addClip(project, videoTrack(project).id, 'v', 0);
  L.addClip(project, audioTrack(project).id, 'm', 0);
  L.removeAsset(project, 'v');
  assert.strictEqual(videoTrack(project).clips.length, 0);
  assert.strictEqual(audioTrack(project).clips.length, 1);
  assert.strictEqual(project.assets.length, 1);
});

test('importing the same file twice updates the row instead of adding one', () => {
  const project = projectWith([VIDEO]);
  const added = L.addAssets(project, [Object.assign({}, VIDEO, { durationMs: 12000 })]);
  assert.strictEqual(added.length, 0, 'nothing new was added');
  assert.strictEqual(project.assets.length, 1);
  assert.strictEqual(project.assets[0].durationMs, 12000, 'the newer probe wins');
});

test('an asset ffprobe could not measure still gets a usable length', () => {
  const rate = T.fps(30);
  assert.strictEqual(
    L.assetLengthFrames(Object.assign({}, VIDEO, { durationMs: 0 }), rate),
    L.DEFAULT_IMAGE_SECONDS * 30
  );
  assert.strictEqual(L.assetLengthFrames(VIDEO, rate), 300);
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
