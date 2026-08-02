'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/timeline.js');

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
  assert.deepStrictEqual(project.settings, { width: 1920, height: 1080, fps: 30 });
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
  const clip = L.addClip(project, videoTrack(project).id, 'v', 2500);
  assert.strictEqual(clip.startMs, 2500);
  assert.strictEqual(clip.inMs, 0);
  assert.strictEqual(clip.outMs, 10000);
});

test('an asset the track cannot play is refused rather than half added', () => {
  const project = projectWith([SOUND]);
  assert.strictEqual(L.addClip(project, videoTrack(project).id, 'm', 0), null);
  assert.strictEqual(videoTrack(project).clips.length, 0);
});

test('a still gets a default length because it has none of its own', () => {
  const project = projectWith([STILL]);
  const clip = L.addClip(project, videoTrack(project).id, 'p', 0);
  assert.strictEqual(L.clipDuration(clip), L.DEFAULT_IMAGE_MS);
});

test('a clip dropped on top of another is pushed past it', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 0);
  const second = L.addClip(project, track.id, 'v', 4000);
  assert.strictEqual(second.startMs, 10000, 'lands after the first clip ends');
});

test('a drop into a gap too small for it keeps walking right', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  // Two clips back to back, then a drop aimed at the seam between them.
  L.addClip(project, track.id, 'v', 0);
  L.addClip(project, track.id, 'v', 10000);
  const third = L.addClip(project, track.id, 'v', 9000);
  assert.strictEqual(third.startMs, 20000);
});

test('moving a clip inside its track does not collide with itself', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 0);
  L.moveClip(project, clip.id, track.id, 3000);
  assert.strictEqual(clip.startMs, 3000);
});

test('a clip moved to another track leaves the first one', () => {
  const project = projectWith([VIDEO]);
  const from = videoTrack(project);
  const to = L.addTrack(project, 'video');
  const clip = L.addClip(project, from.id, 'v', 1000);
  L.moveClip(project, clip.id, to.id, 1000);
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
  const clip = L.addClip(project, videoTrack(project).id, 'v', 5000);
  L.trimClip(project, clip.id, 'start', 7000);
  assert.strictEqual(clip.startMs, 7000);
  assert.strictEqual(clip.inMs, 2000);
  assert.strictEqual(clip.outMs, 10000);
});

test('the start cannot be dragged past the beginning of the source', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 5000);
  L.trimClip(project, clip.id, 'start', 0);
  // The source has nothing before inMs 0, so the clip stops at 5000 - 0.
  assert.strictEqual(clip.startMs, 5000);
  assert.strictEqual(clip.inMs, 0);
});

test('the end cannot be dragged past the end of the source', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 0);
  L.trimClip(project, clip.id, 'start', 3000);
  L.trimClip(project, clip.id, 'end', 999999);
  assert.strictEqual(clip.outMs, 10000, 'stops at the source duration');
  assert.strictEqual(L.clipEnd(clip), 10000);
});

test('a trim will not shrink a clip below the minimum', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 0);
  L.trimClip(project, clip.id, 'end', 1);
  assert.strictEqual(L.clipDuration(clip), L.MIN_CLIP_MS);
});

test('splitting cuts every clip the playhead crosses', () => {
  const project = projectWith([VIDEO, SOUND]);
  const video = videoTrack(project);
  const audio = audioTrack(project);
  L.addClip(project, video.id, 'v', 0);
  L.addClip(project, audio.id, 'm', 0);
  const created = L.splitAt(project, 4000);
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
  L.splitAt(project, 4000, target.id);
  assert.strictEqual(video.clips.length, 2);
  assert.strictEqual(audio.clips.length, 1);
});

test('the two halves of a split are continuous in the source', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 2000);
  const wasEnd = L.clipEnd(clip);
  L.splitAt(project, 5000);
  const [left, right] = track.clips;
  assert.strictEqual(left.outMs, right.inMs, 'no frames lost or repeated at the cut');
  assert.strictEqual(L.clipEnd(left), right.startMs, 'no gap at the cut');
  assert.strictEqual(right.startMs, 5000);
  assert.strictEqual(L.clipEnd(right), wasEnd, 'the tail still ends where it did');
  assert.strictEqual(L.projectDurationMs(project), 12000, 'the timeline is the same length');
});

test('splitting on an edge or inside a sliver does nothing', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 1000);
  assert.strictEqual(L.splitAt(project, 1000).length, 0, 'the clip start is not a cut');
  assert.strictEqual(L.splitAt(project, 11000).length, 0, 'the clip end is not a cut');
  assert.strictEqual(L.splitAt(project, 1010).length, 0, 'would leave a 10ms sliver');
  assert.strictEqual(track.clips.length, 1);
});

test('a hidden track does not stretch the timeline', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const second = L.addTrack(project, 'video');
  L.addClip(project, track.id, 'v', 0);
  L.addClip(project, second.id, 'v', 30000);
  assert.strictEqual(L.projectDurationMs(project), 40000);
  second.hidden = true;
  assert.strictEqual(L.projectDurationMs(project), 10000);
});

test('a muted audio track drops out of the length too', () => {
  const project = projectWith([SOUND]);
  const audio = audioTrack(project);
  L.addClip(project, audio.id, 'm', 0);
  assert.strictEqual(L.projectDurationMs(project), 30000);
  audio.muted = true;
  assert.strictEqual(L.projectDurationMs(project), 0);
});

test('what is under the playhead knows where it is inside the asset', () => {
  const project = projectWith([VIDEO]);
  const clip = L.addClip(project, videoTrack(project).id, 'v', 2000);
  L.trimClip(project, clip.id, 'start', 3000);
  const active = L.clipsAt(project, 5000);
  assert.strictEqual(active.length, 1);
  // 2s into the clip, which starts 1s into the source.
  assert.strictEqual(active[0].sourceMs, 3000);
  assert.strictEqual(L.clipsAt(project, 99999).length, 0);
});

test('the playhead snaps to the nearest edge inside the tolerance', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 4000);
  assert.strictEqual(L.snapTime(project, 4080, 150), 4000, 'to a clip start');
  assert.strictEqual(L.snapTime(project, 13900, 150), 14000, 'to a clip end');
  assert.strictEqual(L.snapTime(project, 7000, 150), 7000, 'nothing nearby');
  assert.strictEqual(L.snapTime(project, 60, 150), 0, 'zero is a target');
});

test('a tolerance of zero is the magnet turned off', () => {
  const project = projectWith([VIDEO]);
  L.addClip(project, videoTrack(project).id, 'v', 4000);
  assert.strictEqual(L.snapTime(project, 4080, 0), 4080);
});

test('a dragged clip snaps by its tail as well as its head', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const first = L.addClip(project, track.id, 'v', 10000);
  const second = L.addTrack(project, 'video');
  const moving = L.addClip(project, second.id, 'v', 0);
  // Dragging so the clip ends near the start of the other one: the tail is
  // what should stick, which means a start of 10000 - 10000 = 0.
  const start = L.snapClipStart(project, 120, 10000, 200, { exceptClipId: moving.id });
  assert.strictEqual(start, 0);
  assert.strictEqual(first.startMs, 10000);
});

test('a clip is never snapped to itself', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  const clip = L.addClip(project, track.id, 'v', 4000);
  const start = L.snapClipStart(project, 4050, 10000, 200, { exceptClipId: clip.id });
  assert.strictEqual(start, 4050, 'its own edges are not targets');
});

test('a project read back from disk does not reuse its own ids', () => {
  const project = projectWith([VIDEO]);
  const track = videoTrack(project);
  L.addClip(project, track.id, 'v', 0);
  const reopened = L.normalize(JSON.parse(JSON.stringify(project)));
  const fresh = L.addClip(reopened, reopened.tracks[0].id, 'v', 20000);
  const ids = reopened.tracks.flatMap((each) => each.clips.map((clip) => clip.id));
  assert.strictEqual(new Set(ids).size, ids.length, `duplicate id in ${ids.join(',')}`);
  assert.ok(fresh);
});

test('normalize fills in what an older project file did not have', () => {
  const restored = L.normalize({
    tracks: [{ id: 't1', kind: 'video', name: 'V1', clips: [{ id: 'c1', assetId: 'v', startMs: 0, inMs: 0, outMs: 1000 }] }],
  });
  assert.strictEqual(restored.tracks[0].clips[0].volume, 1);
  assert.strictEqual(restored.tracks[0].clips[0].opacity, 1);
  assert.deepStrictEqual(restored.settings, { width: 1920, height: 1080, fps: 30 });
  assert.deepStrictEqual(restored.assets, []);
});

test('an empty project file still opens with tracks to work on', () => {
  const restored = L.normalize({});
  assert.deepStrictEqual(restored.tracks.map((track) => track.name), ['V1', 'A1']);
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
  assert.strictEqual(L.assetLengthMs(Object.assign({}, VIDEO, { durationMs: 0 })), L.DEFAULT_IMAGE_MS);
  assert.strictEqual(L.assetLengthMs(VIDEO), 10000);
});

test('the clock reads the way a transport should', () => {
  assert.strictEqual(L.formatTime(0), '0:00:00.00');
  assert.strictEqual(L.formatTime(3661230), '1:01:01.23');
  assert.strictEqual(L.formatTime(-5), '0:00:00.00');
});

test('ruler ticks stay far enough apart to read at any zoom', () => {
  for (const pxPerSecond of [2, 10, 60, 200, 800]) {
    const step = L.tickStepMs(pxPerSecond);
    assert.ok(L.msToPx(step, pxPerSecond) >= 70 || step === 600000, `${pxPerSecond}px/s gave ${step}ms`);
  }
});

test('pixels and milliseconds convert both ways', () => {
  assert.strictEqual(L.msToPx(2000, 50), 100);
  assert.strictEqual(L.pxToMs(100, 50), 2000);
});
