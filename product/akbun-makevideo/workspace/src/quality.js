'use strict';

const DEFAULT_QUALITY_LIMITS = {
  frameIntervalP50Ms: Math.ceil(1000 / 30 * 1.25),
  frameIntervalP99Ms: Math.ceil(1000 / 30 * 2),
  droppedFrameRate: 0.001,
  avDriftP99Ms: 50,
  startupDelayP99Ms: 500,
  memoryGrowthBytes: 64 * 1024 * 1024,
};

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function videoCounters(element) {
  if (typeof element.getVideoPlaybackQuality === 'function') {
    const value = element.getVideoPlaybackQuality();
    if (value.totalVideoFrames > 0 || value.droppedVideoFrames > 0) {
      return {
        available: true,
        dropped: value.droppedVideoFrames || 0,
        total: value.totalVideoFrames || 0,
      };
    }
  }
  const available = Number.isFinite(element.webkitDroppedFrameCount);
  return {
    available,
    dropped: element.webkitDroppedFrameCount || 0,
    total: element.webkitDecodedFrameCount || 0,
  };
}

function evaluateQuality(metrics, limits) {
  const checks = {
    frameIntervalP50Ms:
      metrics.frameIntervalP50Ms !== null &&
      metrics.frameIntervalP50Ms <= limits.frameIntervalP50Ms,
    frameIntervalP99Ms:
      metrics.frameIntervalP99Ms !== null &&
      metrics.frameIntervalP99Ms <= limits.frameIntervalP99Ms,
    droppedFrames:
      metrics.totalFrames > 0 &&
      metrics.droppedFrames / metrics.totalFrames <= limits.droppedFrameRate,
    avDriftP99Ms:
      metrics.avDriftP99Ms !== null && metrics.avDriftP99Ms <= limits.avDriftP99Ms,
    startupDelayP99Ms:
      metrics.startupDelayP99Ms !== null &&
      metrics.startupDelayP99Ms <= limits.startupDelayP99Ms,
    memoryGrowthBytes:
      metrics.memoryGrowthBytes !== null &&
      metrics.memoryGrowthBytes <= limits.memoryGrowthBytes,
  };
  return { pass: Object.values(checks).every(Boolean), checks };
}

function createQualityMonitor(options) {
  const now = options.now || (() => performance.now());
  const limits = Object.assign({}, DEFAULT_QUALITY_LIMITS, options.limits || {});
  const videos = new Set();
  const frameRequests = new Map();
  let run = null;

  function primaryVideo() {
    return [...videos]
      .filter((element) => element.classList.contains('on'))
      .sort((left, right) => Number(right.style.zIndex || 0) - Number(left.style.zIndex || 0))[0];
  }

  function watchVideo(element) {
    if (videos.has(element)) return;
    videos.add(element);
    if (typeof element.requestVideoFrameCallback !== 'function') return;
    const frame = (timestamp, metadata) => {
      if (run && primaryVideo() === element) {
        collectCounters(element);
        if (run.lastFrameAt !== null) run.frameIntervals.push(timestamp - run.lastFrameAt);
        run.lastFrameAt = timestamp;
        run.presentedCallbacks += 1;
        const presented = metadata && metadata.presentedFrames;
        const mediaTime = metadata && metadata.mediaTime;
        if (
          run.lastVideo === element &&
          Number.isFinite(presented) &&
          Number.isFinite(run.lastPresentedFrames) &&
          Number.isFinite(mediaTime) &&
          Number.isFinite(run.lastMediaTime) &&
          mediaTime > run.lastMediaTime &&
          mediaTime - run.lastMediaTime <= 1
        ) {
          const expected = Math.max(1, Math.round((mediaTime - run.lastMediaTime) * run.fps));
          const displayed = Math.max(1, presented - run.lastPresentedFrames);
          run.callbackDrops += Math.max(0, expected - displayed);
          run.callbackFrames += expected;
        } else {
          run.callbackFrames += 1;
        }
        run.lastVideo = element;
        run.lastPresentedFrames = presented;
        run.lastMediaTime = mediaTime;
        if (run.pendingStartupAt !== null) {
          run.startupDelays.push(timestamp - run.pendingStartupAt);
          run.pendingStartupAt = null;
        }
      }
      if (videos.has(element)) {
        frameRequests.set(element, element.requestVideoFrameCallback(frame));
      }
    };
    frameRequests.set(element, element.requestVideoFrameCallback(frame));
  }

  function collectCounters(element) {
    if (!run) return;
    const after = videoCounters(element);
    if (!after.available) return;
    const before = run.counters.get(element) || { dropped: 0, total: 0 };
    run.counterDrops += after.dropped >= before.dropped
      ? after.dropped - before.dropped
      : after.dropped;
    run.counterFrames += after.total >= before.total ? after.total - before.total : after.total;
    run.counters.set(element, after);
    run.hasVideoCounters = true;
  }

  function unwatchVideo(element) {
    videos.delete(element);
    const request = frameRequests.get(element);
    if (request !== undefined && typeof element.cancelVideoFrameCallback === 'function') {
      element.cancelVideoFrameCallback(request);
    }
    frameRequests.delete(element);
  }

  function start(name, fps, metadata) {
    const startedAt = now();
    const counters = new Map();
    for (const element of videos) counters.set(element, videoCounters(element));
    run = {
      name,
      fps,
      metadata: metadata || {},
      startedAt,
      frameIntervals: [],
      drift: [],
      startupDelays: [],
      memory: [],
      counters,
      lastFrameAt: null,
      pendingStartupAt: null,
      presentedCallbacks: 0,
      callbackDrops: 0,
      callbackFrames: 0,
      counterDrops: 0,
      counterFrames: 0,
      hasVideoCounters: false,
      lastVideo: null,
      lastPresentedFrames: null,
      lastMediaTime: null,
    };
  }

  function discontinuity() {
    if (!run) return;
    run.lastFrameAt = null;
    run.lastVideo = null;
    run.lastPresentedFrames = null;
    run.lastMediaTime = null;
  }

  function playbackRequested() {
    if (!run) return;
    run.pendingStartupAt = now();
    discontinuity();
  }

  function sampleDrift(valueMs) {
    if (run && Number.isFinite(valueMs)) run.drift.push(Math.abs(valueMs));
  }

  function sampleMemory(valueBytes) {
    if (run && Number.isFinite(valueBytes)) run.memory.push(valueBytes);
  }

  function finish() {
    if (!run) throw new Error('quality run has not started');
    const endedAt = now();
    for (const element of videos) collectCounters(element);
    const memoryStart = run.memory[0];
    const memoryPeak = run.memory.length ? Math.max(...run.memory) : null;
    const memoryGrowthBytes = memoryPeak === null ? null : Math.max(0, memoryPeak - memoryStart);
    const durationMs = Math.max(1, endedAt - run.startedAt);
    const metrics = {
      frameIntervalP50Ms: finite(percentile(run.frameIntervals, 0.5)),
      frameIntervalP99Ms: finite(percentile(run.frameIntervals, 0.99)),
      droppedFrames: run.hasVideoCounters ? run.counterDrops : run.callbackDrops,
      totalFrames: run.hasVideoCounters ? run.counterFrames : run.callbackFrames,
      avDriftP99Ms: finite(percentile(run.drift, 0.99)),
      startupDelayP99Ms: finite(percentile(run.startupDelays, 0.99)),
      memoryGrowthBytes,
      memoryGrowthBytesPerMinute:
        memoryGrowthBytes === null ? null : memoryGrowthBytes * 60000 / durationMs,
    };
    const report = {
      scenario: run.name,
      durationMs,
      fps: run.fps,
      metadata: run.metadata,
      metrics,
      limits,
      evaluation: evaluateQuality(metrics, limits),
    };
    run = null;
    return report;
  }

  return {
    watchVideo,
    unwatchVideo,
    start,
    finish,
    playbackRequested,
    sampleDrift,
    sampleMemory,
    discontinuity,
    isRunning: () => Boolean(run),
  };
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sampleMemorySafely(memoryBytes, monitor) {
  try {
    monitor.sampleMemory(await memoryBytes());
  } catch {
    monitor.sampleMemory(null);
  }
}

function startMemorySampling(memoryBytes, monitor) {
  let stopped = false;
  let timer = null;
  let current = Promise.resolve();

  function schedule() {
    current = sampleMemorySafely(memoryBytes, monitor).then(() => {
      if (!stopped) timer = window.setTimeout(schedule, 1000);
    });
  }

  schedule();
  return async () => {
    stopped = true;
    if (timer !== null) window.clearTimeout(timer);
    await current;
    await sampleMemorySafely(memoryBytes, monitor);
  };
}

/** The project frame rate as a plain number. The model holds it as two
 *  integers so 29.97 stays exact; a measurement of how many frames arrived is
 *  happy with the decimal. */
function rateNumber(project) {
  const rate = (project && project.settings && project.settings.rate) || { num: 30, den: 1 };
  return rate.num / rate.den;
}

function createQualityHarness(options) {
  const monitor = options.monitor;
  const preview = options.preview;
  const getProject = options.getProject;
  const refresh = options.refresh || (() => {});
  const memoryBytes = options.memoryBytes || (async () => null);

  async function measure(name, action, metadata) {
    const project = getProject();
    // The monitor counts presented frames against the rate they are meant to
    // arrive at, so it wants a number rather than the ratio the project holds.
    monitor.start(name, rateNumber(project), metadata);
    const stopMemorySampling = startMemorySampling(memoryBytes, monitor);
    try {
      await action();
    } finally {
      preview.pause();
      await stopMemorySampling();
    }
    return monitor.finish();
  }

  async function playFor(durationMs) {
    await preview.play();
    await delay(durationMs);
    preview.pause();
  }

  async function continuous(config) {
    preview.seek(0);
    return measure('continuous-playback', () => playFor(config.continuousMs));
  }

  async function stopRestart(config) {
    preview.seek(0);
    return measure('stop-and-restart', async () => {
      for (let index = 0; index < config.restartCount; index += 1) {
        await playFor(config.restartPlayMs);
        await delay(config.restartPauseMs);
      }
    }, { repetitions: config.restartCount });
  }

  async function trackGrowth(config) {
    const tracks = getProject().tracks;
    const saved = tracks.map((track) => ({ track, hidden: track.hidden, muted: track.muted }));
    const video = tracks.filter((track) => track.kind === 'video');
    const audio = tracks.filter((track) => track.kind === 'audio');
    try {
      return await measure('increasing-track-count', async () => {
        const maximum = Math.max(video.length, audio.length);
        for (let count = 1; count <= maximum; count += 1) {
          video.forEach((track, index) => { track.hidden = index >= count; });
          audio.forEach((track, index) => { track.muted = index >= count; });
          refresh();
          preview.seek(0);
          await playFor(config.trackStepMs);
        }
      }, { maximumVideoTracks: video.length, maximumAudioTracks: audio.length });
    } finally {
      for (const item of saved) {
        item.track.hidden = item.hidden;
        item.track.muted = item.muted;
      }
      refresh();
    }
  }

  async function repeatedSeek(config) {
    return measure('repeated-seek', async () => {
      await preview.play();
      // Seven seconds apart, kept a second clear of the end. The preview
      // counts frames now, so the distances are seconds times the rate.
      const perSecond = rateNumber(getProject());
      for (let index = 0; index < config.seekCount; index += 1) {
        await delay(config.seekIntervalMs);
        const span = Math.max(perSecond, preview.total() - perSecond);
        preview.seek((index * 7 * perSecond) % span);
      }
    }, { repetitions: config.seekCount });
  }

  async function runAll(overrides) {
    const config = Object.assign({
      continuousMs: 5 * 60 * 1000,
      restartCount: 10,
      restartPlayMs: 3000,
      restartPauseMs: 500,
      trackStepMs: 15000,
      seekCount: 20,
      seekIntervalMs: 1000,
    }, overrides || {});
    const project = getProject();
    if (preview.mode() !== 'timeline' || preview.total() <= 0) {
      throw new Error('open the generated quality project in Timeline mode first');
    }
    const reports = [];
    reports.push(await continuous(config));
    reports.push(await stopRestart(config));
    reports.push(await trackGrowth(config));
    reports.push(await repeatedSeek(config));
    preview.seek(0);
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      engine: 'media-element',
      userAgent: navigator.userAgent,
      project: {
        width: project.settings.width,
        height: project.settings.height,
        // The report stays comparable with the ones taken before the timebase
        // was a ratio, so this is still a number; the ratio it came from is
        // next to it for the rates that are not one.
        fps: rateNumber(project),
        rate: (project.settings && project.settings.rate) || { num: 30, den: 1 },
      },
      config,
      pass: reports.every((report) => report.evaluation.pass),
      scenarios: reports,
    };
  }

  async function runAndSave(overrides) {
    const report = await runAll(overrides);
    if (options.saveReport) await options.saveReport(report);
    return report;
  }

  return { runAll, runAndSave };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_QUALITY_LIMITS,
    percentile,
    evaluateQuality,
    createQualityMonitor,
    sampleMemorySafely,
  };
} else {
  globalThis.qualityLib = {
    DEFAULT_QUALITY_LIMITS,
    createQualityMonitor,
    createQualityHarness,
  };
}
