//! Frames arriving at playback speed: one decoder per clip on its own thread,
//! each filling a bounded queue ahead of the playhead.
//!
//! The frame loop used to read every active decoder in turn, one frame at a
//! time. That is fine when the destination is a file and nobody is watching: it
//! ties the whole timeline to whichever decoder is slowest, and the render just
//! takes longer. It cannot play. One clip stalling for 40 ms stops every clip
//! for 40 ms, and at 30 fps that is a visible hitch.
//!
//! Here each clip decodes on its own thread into a queue of finished frames.
//! The consumer never decodes anything; it takes what is already there. A
//! decoder that falls behind is absorbed by the depth of its queue, and only a
//! decoder that stays behind for longer than the queue is deep reaches the
//! playhead at all.
//!
//! Two things are deliberately not here. Nothing links ffmpeg as a library: a
//! decoder is still a process, so a file that kills it kills one clip rather
//! than the editor. And nothing draws — the frames come out as bytes, and the
//! compositor next door turns them into a picture, so this is testable with no
//! ffmpeg, no media and no graphics device.

use crate::{lut::Lut, Placement as Draw, Source};
use makevideo_render::layout::{self, Placement, Rect};
use makevideo_render::{ffmpeg, AssetKind, Project, Rate, RationalTime};
use std::collections::VecDeque;
use std::io::Read;
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, TryRecvError, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// How many frames one clip may hold decoded ahead of the playhead.
///
/// The trade is memory against jitter: a queue costs `depth * width * height *
/// 4` bytes for every clip that is on screen, and buys that many frames of
/// slack before a slow decoder is noticed. Six frames is 200 ms at 30 fps,
/// which covers a keyframe seek, and 50 MB a clip at 1080p.
pub const DEFAULT_DEPTH: usize = 6;

/// How far ahead of the playhead a clip's decoder is started.
///
/// Starting a decoder is spawning a process and seeking a file, which is tens
/// of milliseconds at best. Doing it on the frame the clip appears means that
/// frame is late by all of it, so it is done half a second early instead.
pub const DEFAULT_LEAD: i64 = 15;

/// A decoder already moving forward is cheaper to keep than an ffmpeg process
/// is to restart. Beyond this distance the queued work is no longer a useful
/// head start, so the old seek path remains the safer bound.
pub const MAX_FORWARD_SEEK: i64 = 24;

/// While a seek is still decoding its exact target, playback may use only a
/// project frame immediately behind it. Paused stills never use this path.
pub const SEEK_NEIGHBOR_FRAMES: i64 = 2;

/// How long a paused decoder keeps its process and bounded queue warm.
/// Resuming inside this window avoids another process spawn; after it, the
/// isolated child is released instead of occupying memory indefinitely.
pub const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(2);

/// How long `take_by` sleeps between attempts while it waits.
const POLL: Duration = Duration::from_micros(500);

/// How much is decoded ahead, and how early. Both are settings rather than
/// constants because the right values depend on the source resolution and the
/// number of tracks, which is what the supply meter next door measures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Buffering {
    pub depth: usize,
    pub lead: i64,
}

impl Buffering {
    pub fn new(depth: usize, lead: i64) -> Buffering {
        Buffering {
            depth: depth.max(1),
            lead: lead.max(0),
        }
    }
}

impl Default for Buffering {
    fn default() -> Self {
        Buffering::new(DEFAULT_DEPTH, DEFAULT_LEAD)
    }
}

/// One clip's decoded frame, and where it goes.
pub struct Layer {
    pub clip_id: String,
    pub pixels: Vec<u8>,
    pub dst: Rect,
    pub opacity: f32,
    pub blend_mode: makevideo_render::BlendMode,
    pub lut: Option<Arc<Lut>>,
    pub track_order: usize,
}

/// Everything on screen at one instant, bottom layer first.
pub struct Frame {
    pub frame: i64,
    pub layers: Vec<Layer>,
    /// Text and shape items over the clips, rasterized by `text::layers_at`.
    /// Part of the frame rather than a second pass in each sink, so playback,
    /// the paused still and the soak all composite the same picture.
    pub visuals: Vec<crate::text::RasterLayer>,
}

/// Deliberately hand written: a derived one would print a megabyte of pixels
/// into a test failure and hide the thing that failed.
impl std::fmt::Debug for Frame {
    fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let clips: Vec<&str> = self
            .layers
            .iter()
            .map(|layer| layer.clip_id.as_str())
            .collect();
        write!(out, "Frame {} {:?}", self.frame, clips)
    }
}

impl Frame {
    /// The layers as the compositor takes them: track order first, then the
    /// visual items on each track in z order.
    pub fn sources(&self) -> Vec<(Source<'_>, Draw)> {
        let mut sources: Vec<_> = self
            .layers
            .iter()
            .map(|layer| {
                (
                    layer.track_order,
                    0_u8,
                    0_i32,
                    Source {
                        rgba: &layer.pixels,
                        width: layer.dst.w,
                        height: layer.dst.h,
                        lut: layer.lut.as_deref(),
                    },
                    Draw {
                        dst: layer.dst,
                        opacity: layer.opacity,
                        blend_mode: layer.blend_mode,
                        adjustment: false,
                    },
                )
            })
            .chain(self.visuals.iter().map(|layer| {
                (
                    layer.track_order,
                    1_u8,
                    layer.z_index,
                    Source {
                        rgba: &layer.pixels,
                        width: layer.width,
                        height: layer.height,
                        lut: layer.lut.as_deref(),
                    },
                    layer.placement,
                )
            }))
            .collect();
        sources.sort_by_key(|entry| (entry.0, entry.1, entry.2));
        sources
            .into_iter()
            .map(|(_, _, _, source, placement)| (source, placement))
            .collect()
    }
}

/// What a poll found.
#[derive(Debug)]
pub enum Supply {
    Ready(Frame),
    /// At least one clip that should be on screen had nothing buffered.
    /// **Nothing was consumed**: the frames that were ready stay where they
    /// are, so a retry gets the same instant rather than a torn one.
    Starved,
    /// Past the end of the timeline.
    End,
}

/// Resource state of this source's decoder processes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecoderLifecycle {
    Running,
    Idle,
    Released,
}

struct DecodedFrame {
    generation: u64,
    frame: i64,
    pixels: Vec<u8>,
}

#[derive(Clone, Copy)]
struct DecoderDemand {
    generation: u64,
    first_frame: i64,
}

struct DecoderControl {
    demand: Mutex<DecoderDemand>,
    wake: std::sync::Condvar,
}

impl DecoderControl {
    fn new(generation: u64, first_frame: i64) -> DecoderControl {
        DecoderControl {
            demand: Mutex::new(DecoderDemand {
                generation,
                first_frame,
            }),
            wake: std::sync::Condvar::new(),
        }
    }

    fn retarget(&self, generation: u64, first_frame: i64) {
        let mut demand = self.demand.lock().unwrap();
        *demand = DecoderDemand {
            generation,
            first_frame,
        };
        self.wake.notify_all();
    }

    fn notify(&self) {
        let _demand = self.demand.lock().unwrap();
        self.wake.notify_all();
    }
}

impl Supply {
    pub fn frame(self) -> Option<Frame> {
        match self {
            Supply::Ready(frame) => Some(frame),
            _ => None,
        }
    }
}

/// One clip and the thread filling its queue.
struct Stream {
    placement: Placement,
    track_order: usize,
    visual: Option<(i32, makevideo_render::layout::OverlayStyle)>,
    lut: Option<Arc<Lut>>,
    frame_bytes: usize,
    receiver: Option<Receiver<DecodedFrame>>,
    /// Frames retained from an existing queue across a short forward seek.
    /// Their generation is promoted only after their absolute project frame
    /// proves they are still valid for the new target.
    ready: VecDeque<DecodedFrame>,
    /// The frame taken out of the queue but not yet handed over, because some
    /// other clip was not ready. This is what makes a starved poll consume
    /// nothing.
    pending: Option<DecodedFrame>,
    /// Every decoded frame not yet consumed, whether it is in the channel, in
    /// `ready`, or in `pending`. Sharing the count with the producer keeps a
    /// retargeted queue within the same memory bound while it is being drained.
    buffered: Arc<AtomicUsize>,
    decoder: Option<JoinHandle<()>>,
    cancellation: Arc<DecoderCancellation>,
    control: Arc<DecoderControl>,
    /// The source could not be opened or has run out. Its clip stops drawing.
    dead: bool,
}

#[derive(Default)]
struct DecoderCancellation {
    cancelled: AtomicBool,
    reader: Mutex<Option<Arc<dyn CancelRead>>>,
}

impl DecoderCancellation {
    fn attach(&self, reader: Option<Arc<dyn CancelRead>>) -> bool {
        *self.reader.lock().unwrap() = reader;
        if !self.cancelled.load(Ordering::SeqCst) {
            return false;
        }
        self.cancel();
        true
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(reader) = self.reader.lock().unwrap().as_ref() {
            reader.cancel();
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Stream {
    fn wants(&self, frame: i64) -> bool {
        self.placement.covers(frame)
    }
}

/// The timeline as a stream of composited-ready frames.
///
/// Not connected to the window. It is driven by the supply meter and by the
/// render, both of which are headless, and that is deliberate: a supply problem
/// and a drawing problem look the same on screen and different in a number.
pub struct FrameSource {
    readers: Arc<dyn Readers>,
    streams: Vec<Stream>,
    retiring: Vec<JoinHandle<()>>,
    buffering: Buffering,
    rate: Rate,
    frames: i64,
    position: i64,
    generation: u64,
    /// A tolerant seek consumes at most two earlier project frames while it
    /// waits for the exact target. The latest complete one is offered to the
    /// playback scheduler, but never returned by `take` itself.
    seek_probe: Option<i64>,
    seek_neighbor: Option<Frame>,
    lifecycle_clock: Arc<dyn LifecycleClock>,
    idle_timeout: Duration,
    idle_since: Option<Duration>,
    /// The edit this source was built from, kept for the text and shape items.
    /// They are rasterized per frame (and cached by content) rather than
    /// decoded, so they have no stream of their own.
    project: Project,
    width: u32,
    height: u32,
    video_frame_ceiling: usize,
    visual_frame_ceiling: usize,
}

impl FrameSource {
    /// `width` and `height` are the output frame; every clip is scaled to its
    /// place inside it by `layout::placements`, which is the same arithmetic
    /// the render and the preview use.
    pub fn new(
        project: &Project,
        width: u32,
        height: u32,
        buffering: Buffering,
        readers: Arc<dyn Readers>,
    ) -> FrameSource {
        Self::new_with_clock(
            project,
            width,
            height,
            buffering,
            readers,
            Arc::new(SystemClock::new()),
            DEFAULT_IDLE_TIMEOUT,
        )
    }

    fn new_with_clock(
        project: &Project,
        width: u32,
        height: u32,
        buffering: Buffering,
        readers: Arc<dyn Readers>,
        lifecycle_clock: Arc<dyn LifecycleClock>,
        idle_timeout: Duration,
    ) -> FrameSource {
        let streams = layout::placements(project, width, height)
            .into_iter()
            .map(|placement| {
                let transition = placement
                    .clip_id
                    .strip_prefix("transition:")
                    .and_then(|id| project.transition(id));
                let source_clip_id = transition
                    .map(|entry| entry.to_clip_id.as_str())
                    .unwrap_or(placement.clip_id.as_str());
                let visual = project.visual_item(&placement.clip_id).map(|item| {
                    (
                        item.z_index,
                        placement
                            .overlay_style
                            .clone()
                            .expect("a video visual has overlay styling"),
                    )
                });
                let track_order = project
                    .tracks
                    .iter()
                    .position(|track| {
                        track.id
                            == transition
                                .map(|entry| entry.track_id.as_str())
                                .unwrap_or("")
                            || track.clips.iter().any(|clip| clip.id == placement.clip_id)
                            || track
                                .visual_items
                                .iter()
                                .any(|item| item.id == placement.clip_id)
                    })
                    .unwrap_or(0);
                Stream {
                    frame_bytes: (placement.dst.w as usize) * (placement.dst.h as usize) * 4,
                    lut: project
                        .clip(source_clip_id)
                        .and_then(|clip| clip.lut_path.as_deref())
                        .and_then(|path| Lut::from_cube_file(path).ok())
                        .map(Arc::new),
                    placement,
                    receiver: None,
                    ready: VecDeque::new(),
                    pending: None,
                    buffered: Arc::new(AtomicUsize::new(0)),
                    decoder: None,
                    cancellation: Arc::new(DecoderCancellation::default()),
                    control: Arc::new(DecoderControl::new(0, 0)),
                    dead: false,
                    track_order,
                    visual,
                }
            })
            .collect();
        let mut source = FrameSource {
            readers,
            streams,
            retiring: Vec::new(),
            buffering,
            rate: project.rate(),
            frames: layout::frame_count(project),
            position: 0,
            generation: 0,
            seek_probe: None,
            seek_neighbor: None,
            lifecycle_clock,
            idle_timeout,
            idle_since: None,
            project: project.clone(),
            width,
            height,
            video_frame_ceiling: 0,
            visual_frame_ceiling: 0,
        };
        // Immutable project/layout bounds are sampled every playback tick.
        // Calculate them once instead of allocating and sweeping events at
        // frame rate, which matters on the already-busy multi-track CPU path.
        source.video_frame_ceiling = source.calculate_video_frame_ceiling();
        source.visual_frame_ceiling = source.calculate_visual_frame_ceiling();
        source
    }

    pub fn rate(&self) -> Rate {
        self.rate
    }

    /// How long the timeline is, in frames.
    pub fn frames(&self) -> i64 {
        self.frames
    }

    /// The frame the next `take` will hand over.
    pub fn position(&self) -> i64 {
        self.position
    }

    /// Frames sitting decoded, over every clip.
    pub fn buffered_frames(&self) -> usize {
        let decoded = self
            .streams
            .iter()
            .map(|stream| stream.buffered.load(Ordering::SeqCst))
            .sum::<usize>();
        decoded
            + self
                .seek_neighbor
                .as_ref()
                .map(|frame| frame.layers.len())
                .unwrap_or(0)
    }

    /// What those frames cost, which is the number the buffering settings are
    /// really trading against.
    pub fn buffered_bytes(&self) -> usize {
        let decoded = self
            .streams
            .iter()
            .map(|stream| stream.buffered.load(Ordering::SeqCst) * stream.frame_bytes)
            .sum::<usize>();
        decoded
            + self
                .seek_neighbor
                .as_ref()
                .map(|frame| {
                    frame
                        .layers
                        .iter()
                        .map(|layer| layer.pixels.len())
                        .sum::<usize>()
                        + frame
                            .visuals
                            .iter()
                            .map(|layer| layer.pixels.len())
                            .sum::<usize>()
                })
                .unwrap_or(0)
    }

    /// The most the queues can hold at one instant: every clip that can be
    /// buffering at the same time, full, plus one pending frame per stream and
    /// one complete project-frame neighbor retained during a seek. The supply
    /// meter holds the source to this, which is what turns "bounded memory"
    /// from a claim into a check.
    ///
    /// Summing every clip in the project instead would be a bound nothing could
    /// ever reach — a hundred clips one after another are never buffering
    /// together — and a limit that loose catches no leak at all. A clip's queue
    /// exists from `lead` frames before it appears until the playhead leaves
    /// it, so what is wanted is the heaviest overlap of those spans.
    pub fn buffer_ceiling(&self) -> usize {
        (self.buffering.depth + 2) * self.video_frame_ceiling + self.visual_frame_ceiling
    }

    /// Largest simultaneous decoded video payload for one project frame.
    /// Schedulers that retain a frame after decode use one extra copy of this
    /// bound beyond the source's own queues.
    pub fn frame_ceiling(&self) -> usize {
        self.video_frame_ceiling + self.visual_frame_ceiling
    }

    fn calculate_video_frame_ceiling(&self) -> usize {
        // (position, starting, bytes). An end is applied before a start at the
        // same position, because that is the order `tend` does it in.
        let mut events: Vec<(i64, u8, usize)> = Vec::new();
        for stream in &self.streams {
            let from = stream.placement.start_frame - self.buffering.lead;
            let until = stream.placement.end_frame();
            if until <= from {
                continue;
            }
            events.push((from, 1, stream.frame_bytes));
            events.push((until, 0, stream.frame_bytes));
        }
        events.sort_by_key(|(position, starting, _)| (*position, *starting));

        let (mut live, mut worst) = (0usize, 0usize);
        for (_, starting, bytes) in events {
            if starting == 1 {
                live += bytes;
                worst = worst.max(live);
            } else {
                live -= bytes;
            }
        }
        worst
    }

    fn calculate_visual_frame_ceiling(&self) -> usize {
        let mut events: Vec<(i64, u8, usize)> =
            crate::text::byte_spans(&self.project, self.width, self.height)
                .into_iter()
                .flat_map(|(from, until, bytes)| [(from, 1, bytes), (until, 0, bytes)])
                .collect();
        events.sort_by_key(|(position, starting, _)| (*position, *starting));

        let (mut live, mut worst) = (0usize, 0usize);
        for (_, starting, bytes) in events {
            if starting == 1 {
                live += bytes;
                worst = worst.max(live);
            } else {
                live -= bytes;
            }
        }
        worst
    }

    /// The clips with a decoder running, in paint order.
    pub fn decoding(&self) -> Vec<&str> {
        self.streams
            .iter()
            .filter(|stream| stream.decoder.is_some())
            .map(|stream| stream.placement.clip_id.as_str())
            .collect()
    }

    /// Whether decoder processes are being used, retained briefly while
    /// paused, or fully released.
    pub fn decoder_lifecycle(&self) -> DecoderLifecycle {
        if !self.has_decoder_pipeline() {
            DecoderLifecycle::Released
        } else if self.idle_since.is_some() {
            DecoderLifecycle::Idle
        } else {
            DecoderLifecycle::Running
        }
    }

    /// Keep live decoders warm while no frame is being requested.
    pub fn idle_decoders(&mut self) {
        if self.has_decoder_pipeline() && self.idle_since.is_none() {
            self.idle_since = Some(self.lifecycle_clock.now());
        }
    }

    /// A new frame request makes retained decoders active again.
    pub fn resume_decoders(&mut self) {
        self.idle_since = None;
    }

    /// Release decoders whose idle window has elapsed. This does not redraw or
    /// clear a sink, so the last exact paused frame remains visible.
    pub fn maintain_decoders(&mut self) {
        let Some(since) = self.idle_since else {
            return;
        };
        if self.lifecycle_clock.now().saturating_sub(since) < self.idle_timeout {
            return;
        }
        for index in 0..self.streams.len() {
            if self.stream_has_pipeline(index) {
                self.retire(index);
            }
        }
        self.reap();
    }

    /// Move the playhead. A short forward move keeps a live decoder and advances
    /// it to the target; a backward or large move keeps the isolated-process
    /// restart path.
    ///
    /// While the exact frame is on its way, up to two complete project frames
    /// immediately before it are made available through [`Self::take_neighbor_before`].
    /// They never come back from [`Self::take`], so callers that require an exact
    /// frame do not have to defend against an approximation.
    pub fn seek(&mut self, frame: i64) {
        self.seek_with_tolerance(frame, SEEK_NEIGHBOR_FRAMES);
    }

    /// Seek without exposing an approximate frame. Paused stills use this path,
    /// while retaining the cheap forward-decoder reuse.
    pub fn seek_exact(&mut self, frame: i64) {
        self.seek_with_tolerance(frame, 0);
    }

    fn seek_with_tolerance(&mut self, frame: i64, tolerance: i64) {
        self.resume_decoders();
        let target = frame.clamp(0, self.frames);
        let old_position = self.position;
        let reuse = target >= old_position && target - old_position <= MAX_FORWARD_SEEK;
        self.generation = self.generation.wrapping_add(1);
        self.release_seek_neighbor();

        let mut first = (target - tolerance.max(0)).max(0);
        if reuse {
            // Frames before the consumer's current position are already gone.
            first = first.max(old_position);
        }
        if target >= self.frames || first >= target {
            self.seek_probe = None;
        } else {
            self.seek_probe = Some(first);
        }

        if reuse {
            for index in 0..self.streams.len() {
                if self.stream_has_pipeline(index) {
                    let wanted = first.max(self.streams[index].placement.start_frame);
                    self.retarget(index, wanted);
                }
            }
        } else {
            for index in 0..self.streams.len() {
                self.retire(index);
                // A fresh decoder is a fresh attempt: a clip whose source ran
                // out before the old position may have frames at the new one.
                self.streams[index].dead = false;
            }
        }

        self.position = target;
        self.tend_at(self.seek_probe.unwrap_or(target));
        self.reap();
    }

    /// Take the newest complete frame behind an in-progress seek target.
    /// Exact and future frames are never returned here.
    pub fn take_neighbor_before(&mut self, target: i64, tolerance: i64) -> Option<Frame> {
        if self.position != target {
            return None;
        }
        let neighbor = self.seek_neighbor.take()?;
        let distance = target - neighbor.frame;
        if distance > 0 && distance <= tolerance.max(0) {
            Some(neighbor)
        } else {
            None
        }
    }

    /// One poll. Never blocks and never decodes.
    pub fn take(&mut self) -> Supply {
        self.resume_decoders();
        self.reap();
        if self.position >= self.frames {
            // Before returning, retire the last clip by reaching the timeline
            // end rather than waiting for the whole source to drop.
            self.tend_at(self.position);
            return Supply::End;
        }

        loop {
            let frame = self.seek_probe.unwrap_or(self.position);
            self.tend_at(frame);
            match self.take_frame(frame) {
                Supply::Ready(ready) if frame < self.position => {
                    self.release_seek_neighbor();
                    self.seek_neighbor = Some(ready);
                    let next = frame + 1;
                    self.seek_probe = (next < self.position).then_some(next);
                }
                Supply::Ready(ready) => {
                    self.seek_probe = None;
                    self.release_seek_neighbor();
                    self.position += 1;
                    return Supply::Ready(ready);
                }
                supply => return supply,
            }
        }
    }

    fn take_frame(&mut self, frame: i64) -> Supply {
        let mut starved = false;
        let mut finished = Vec::new();
        for stream in self.streams.iter_mut() {
            if !stream.wants(frame) || stream.dead || stream.pending.is_some() {
                continue;
            }
            loop {
                let received = stream
                    .ready
                    .pop_front()
                    .map(Ok)
                    .or_else(|| stream.receiver.as_ref().map(|queue| queue.try_recv()));
                if matches!(&received, Some(Ok(_))) {
                    stream.control.notify();
                }
                match received {
                    Some(Ok(decoded))
                        if decoded.generation != self.generation || decoded.frame < frame =>
                    {
                        stream.buffered.fetch_sub(1, Ordering::SeqCst);
                        stream.control.notify();
                    }
                    Some(Ok(decoded)) if decoded.frame == frame => {
                        stream.pending = Some(decoded);
                        break;
                    }
                    Some(Ok(decoded)) => {
                        // It is newer than the requested project frame. Keep it
                        // for its own turn and never draw it early.
                        stream.ready.push_front(decoded);
                        starved = true;
                        break;
                    }
                    Some(Err(TryRecvError::Disconnected)) => {
                        // Empty and closed. The source is over, so the clip
                        // stops drawing rather than holding the playhead.
                        stream.dead = true;
                        stream.receiver = None;
                        // Its thread already ended, so retire the handle where
                        // it died rather than reporting it for the rest of the
                        // clip.
                        finished.extend(stream.decoder.take());
                        break;
                    }
                    Some(Err(TryRecvError::Empty)) | None => {
                        starved = true;
                        break;
                    }
                }
            }
        }
        self.retiring.append(&mut finished);
        if starved {
            return Supply::Starved;
        }

        let mut layers = Vec::new();
        let mut visuals = Vec::new();
        for stream in self.streams.iter_mut().filter(|stream| stream.wants(frame)) {
            let Some(decoded) = stream.pending.take() else {
                continue;
            };
            stream.buffered.fetch_sub(1, Ordering::SeqCst);
            stream.control.notify();
            if let Some((z_index, style)) = &stream.visual {
                let mut pixels = decoded.pixels;
                apply_overlay_style(
                    &mut pixels,
                    stream.placement.dst.w,
                    stream.placement.dst.h,
                    style,
                );
                visuals.push(crate::text::RasterLayer {
                    pixels: pixels.into(),
                    width: stream.placement.dst.w,
                    height: stream.placement.dst.h,
                    lut: None,
                    placement: Draw {
                        dst: stream.placement.dst,
                        opacity: stream.placement.opacity_at(frame),
                        blend_mode: stream.placement.blend_mode,
                        adjustment: false,
                    },
                    track_order: stream.track_order,
                    z_index: *z_index,
                });
            } else {
                layers.push(Layer {
                    clip_id: stream.placement.clip_id.clone(),
                    pixels: decoded.pixels,
                    dst: stream.placement.dst,
                    opacity: stream.placement.opacity_at(frame),
                    blend_mode: stream.placement.blend_mode,
                    lut: stream.lut.clone(),
                    track_order: stream.track_order,
                });
            }
        }
        visuals.extend(crate::text::layers_at(
            &self.project,
            frame,
            self.width,
            self.height,
        ));
        Supply::Ready(Frame {
            frame,
            layers,
            visuals,
        })
    }
}

impl Drop for FrameSource {
    fn drop(&mut self) {
        for index in 0..self.streams.len() {
            self.retire(index);
        }
        // Now they are joined: a decoder is at most one frame away from
        // noticing its queue is gone, and leaving threads behind would leave
        // ffmpeg processes behind with them.
        for handle in self.retiring.drain(..) {
            let _ = handle.join();
        }
    }
}

mod decoders;
mod reader;
pub use reader::*;
mod overlay;
pub(crate) use overlay::*;

#[cfg(test)]
mod tests;
