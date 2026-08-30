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

trait LifecycleClock: Send + Sync {
    fn now(&self) -> Duration;
}

struct SystemClock {
    started: Instant,
}

impl SystemClock {
    fn new() -> SystemClock {
        SystemClock {
            started: Instant::now(),
        }
    }
}

impl LifecycleClock for SystemClock {
    fn now(&self) -> Duration {
        self.started.elapsed()
    }
}

/// Raw frames for one clip, in order, already scaled to the size they will be
/// drawn at.
///
/// The ffmpeg process is the only implementation the app uses. The trait exists
/// because the buffering is the part that can be wrong, and it can be tested
/// exactly and quickly against a reader that hands back bytes on demand.
pub trait FrameReader: Send {
    /// Fill `buffer` with the next frame. `false` means the source is over,
    /// whether it ran out or broke; either way the clip stops drawing.
    fn read(&mut self, buffer: &mut [u8]) -> bool;

    /// A handle that can interrupt a blocking `read`, when the reader supports
    /// it. The ffmpeg reader uses this to kill its process on seek or drop.
    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        None
    }
}

/// Stops a reader without needing access to the thread currently reading it.
pub trait CancelRead: Send + Sync {
    fn cancel(&self);
}

/// What one clip's decoder is asked for. Owned, because the open happens on the
/// decoder's own thread — a process spawn on the consumer's thread would be a
/// stall on the playhead.
#[derive(Debug, Clone, PartialEq)]
pub struct Open {
    pub path: String,
    pub kind: AssetKind,
    /// Frame of the source to start at, and how many frames are wanted from it.
    pub in_frame: i64,
    pub frames: i64,
    pub width: u32,
    pub height: u32,
    pub rate: Rate,
}

/// Opens the readers.
pub trait Readers: Send + Sync {
    /// `None` means this clip cannot be decoded. It stops drawing, which is the
    /// same hole the timeline shows for media that has moved.
    fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>>;
}

/// The real one: an ffmpeg process per clip, decoding to raw RGBA.
pub struct FfmpegReaders {
    pub ffmpeg: String,
    /// The decode hint confirmed by `accel::candidates`, or None for software.
    pub hwaccel: Option<String>,
}

impl FfmpegReaders {
    pub fn new(ffmpeg: &str, hwaccel: Option<&str>) -> FfmpegReaders {
        FfmpegReaders {
            ffmpeg: ffmpeg.to_string(),
            hwaccel: hwaccel.map(|name| name.to_string()),
        }
    }
}

impl Readers for FfmpegReaders {
    fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>> {
        let decode = ffmpeg::Decode {
            path: &request.path,
            kind: request.kind,
            in_time: RationalTime::new(request.in_frame, request.rate),
            duration: RationalTime::new(request.frames, request.rate),
            width: request.width,
            height: request.height,
            rate: request.rate,
            // A still has nothing to decode, so no hint for it.
            hwaccel: if request.kind == AssetKind::Video {
                self.hwaccel.as_deref()
            } else {
                None
            },
        };
        let fallback = decode.hwaccel.map(|_| {
            let software = ffmpeg::decoder_args(&ffmpeg::Decode {
                path: &request.path,
                kind: request.kind,
                in_time: RationalTime::new(request.in_frame, request.rate),
                duration: RationalTime::new(request.frames, request.rate),
                width: request.width,
                height: request.height,
                rate: request.rate,
                hwaccel: None,
            });
            (self.ffmpeg.clone(), software)
        });
        let args = ffmpeg::decoder_args(&decode);
        FfmpegReader::start(&self.ffmpeg, &args, fallback)
            .map(|reader| Box::new(reader) as Box<dyn FrameReader>)
    }
}

struct FfmpegReader {
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
    stdout: ChildStdout,
    fallback: Option<(String, Vec<String>)>,
    began: bool,
}

impl FfmpegReader {
    fn start(
        ffmpeg: &str,
        args: &[String],
        fallback: Option<(String, Vec<String>)>,
    ) -> Option<FfmpegReader> {
        let (child, stdout) = Self::spawn(ffmpeg, args)?;
        Some(FfmpegReader {
            child: Arc::new(Mutex::new(child)),
            cancelled: Arc::new(AtomicBool::new(false)),
            stdout,
            fallback,
            began: false,
        })
    }

    fn spawn(ffmpeg: &str, args: &[String]) -> Option<(Child, ChildStdout)> {
        let mut child = Command::new(ffmpeg)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // A decoder that cannot open its file stops drawing rather than
            // reporting, so there is nothing to read from stderr.
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let stdout = child.stdout.take()?;
        Some((child, stdout))
    }

    fn retry_with_software(&mut self) -> bool {
        let Some((ffmpeg, args)) = self.fallback.take() else {
            return false;
        };
        // Keep the stable slot locked through replacement. A cancellation
        // racing the fallback then waits and kills the new child, rather than
        // returning after killing only the child that just failed.
        let mut current = self.child.lock().unwrap();
        let _ = current.kill();
        let _ = current.wait();
        if self.cancelled.load(Ordering::SeqCst) {
            return false;
        }
        let Some((child, stdout)) = Self::spawn(&ffmpeg, &args) else {
            return false;
        };
        *current = child;
        self.stdout = stdout;
        true
    }
}

struct FfmpegCancel {
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

impl CancelRead for FfmpegCancel {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        let _ = self.child.lock().unwrap().kill();
    }
}

impl FrameReader for FfmpegReader {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        if self.stdout.read_exact(buffer).is_ok() {
            self.began = true;
            return true;
        }
        if self.began || !self.retry_with_software() || self.stdout.read_exact(buffer).is_err() {
            return false;
        }
        self.began = true;
        true
    }

    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        Some(Arc::new(FfmpegCancel {
            child: Arc::clone(&self.child),
            cancelled: Arc::clone(&self.cancelled),
        }))
    }
}

impl Drop for FfmpegReader {
    /// The decoder thread ends when the consumer drops its end of the queue,
    /// and this is what stops the process it was feeding. Without it a seek
    /// would leave an ffmpeg per clip writing into a pipe nobody reads.
    fn drop(&mut self) {
        let mut child = self.child.lock().unwrap();
        let _ = child.kill();
        let _ = child.wait();
    }
}

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
    pub lut: Option<Arc<Lut>>,
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
    /// The layers as the compositor takes them: clips bottom first, then the
    /// text and shape items over all of them.
    pub fn sources(&self) -> Vec<(Source<'_>, Draw)> {
        self.layers
            .iter()
            .map(|layer| {
                (
                    Source {
                        rgba: &layer.pixels,
                        width: layer.dst.w,
                        height: layer.dst.h,
                        lut: layer.lut.as_deref(),
                    },
                    Draw {
                        dst: layer.dst,
                        opacity: layer.opacity,
                    },
                )
            })
            .chain(self.visuals.iter().map(|layer| {
                (
                    Source {
                        rgba: &layer.pixels,
                        width: layer.width,
                        height: layer.height,
                        lut: None,
                    },
                    layer.placement,
                )
            }))
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
            .map(|placement| Stream {
                frame_bytes: (placement.dst.w as usize) * (placement.dst.h as usize) * 4,
                lut: project
                    .clip(&placement.clip_id)
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

        let layers = self
            .streams
            .iter_mut()
            .filter(|stream| stream.wants(frame))
            .filter_map(|stream| {
                stream.pending.take().map(|decoded| {
                    stream.buffered.fetch_sub(1, Ordering::SeqCst);
                    stream.control.notify();
                    Layer {
                        clip_id: stream.placement.clip_id.clone(),
                        pixels: decoded.pixels,
                        dst: stream.placement.dst,
                        opacity: stream.placement.opacity,
                        lut: stream.lut.clone(),
                    }
                })
            })
            .collect();
        let visuals = crate::text::layers_at(&self.project, frame, self.width, self.height);
        Supply::Ready(Frame {
            frame,
            layers,
            visuals,
        })
    }

    fn has_decoder_pipeline(&self) -> bool {
        (0..self.streams.len()).any(|index| self.stream_has_pipeline(index))
            || self.retiring.iter().any(|decoder| !decoder.is_finished())
    }

    fn stream_has_pipeline(&self, index: usize) -> bool {
        let stream = &self.streams[index];
        stream.decoder.is_some()
            || stream.receiver.is_some()
            || !stream.ready.is_empty()
            || stream.pending.is_some()
    }

    fn release_seek_neighbor(&mut self) {
        self.seek_neighbor = None;
    }

    /// Poll until the frame is there or `deadline` passes. `Starved` coming
    /// back means it did not arrive in time, and the caller decides what that
    /// is worth: the meter counts it, the render waits again.
    pub fn take_by(&mut self, deadline: Instant) -> Supply {
        loop {
            match self.take() {
                Supply::Starved => {
                    if Instant::now() >= deadline {
                        return Supply::Starved;
                    }
                    std::thread::sleep(POLL);
                }
                supply => return supply,
            }
        }
    }

    /// Start the decoders that are about to be needed and stop the ones that
    /// are done.
    fn tend_at(&mut self, position: i64) {
        let lead = self.buffering.lead;
        for index in 0..self.streams.len() {
            let stream = &self.streams[index];
            let over = position >= stream.placement.end_frame();
            if over {
                if stream.decoder.is_some()
                    || stream.receiver.is_some()
                    || !stream.ready.is_empty()
                    || stream.pending.is_some()
                {
                    self.retire(index);
                }
                continue;
            }
            if stream.receiver.is_none()
                && !stream.dead
                && position + lead >= stream.placement.start_frame
            {
                self.start(index, position);
            }
        }
    }

    fn start(&mut self, index: usize, position: i64) {
        let (rate, frames, generation) = (self.rate, self.frames, self.generation);
        let readers = Arc::clone(&self.readers);
        let depth = self.buffering.depth;
        let stream = &mut self.streams[index];
        let placement = &stream.placement;
        // A decoder started before its clip begins reads from the clip's own
        // first frame; one started mid-clip reads from where the playhead is.
        let first = position.max(placement.start_frame);
        let wanted = placement.end_frame().min(frames) - first;
        if wanted <= 0 {
            stream.dead = true;
            return;
        }
        let request = Open {
            path: placement.path.clone(),
            kind: placement.kind,
            in_frame: placement.in_frame + (first - placement.start_frame),
            frames: wanted,
            width: placement.dst.w,
            height: placement.dst.h,
            rate,
        };

        let frame_bytes = stream.frame_bytes;
        let (sender, receiver) = sync_channel::<DecodedFrame>(depth);
        let buffer_limit = depth + 1;
        let buffered = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&buffered);
        let cancellation = Arc::new(DecoderCancellation::default());
        let decoder_cancellation = Arc::clone(&cancellation);
        let control = Arc::new(DecoderControl::new(generation, first));
        let decoder_control = Arc::clone(&control);
        let decoder = std::thread::spawn(move || {
            let Some(mut reader) = readers.open(&request) else {
                // Dropping the sender closes the queue, which is how the
                // consumer hears that this clip has nothing to give.
                return;
            };
            if decoder_cancellation.attach(reader.cancellation()) {
                return;
            }
            let mut frame = first;
            loop {
                let mut buffer = vec![0u8; frame_bytes];
                if !reader.read(&mut buffer) {
                    break;
                }
                let mut pixels = Some(buffer);
                loop {
                    if decoder_cancellation.is_cancelled() {
                        return;
                    }
                    let demand = decoder_control.demand.lock().unwrap();
                    if frame < demand.first_frame {
                        break;
                    }
                    if counter.load(Ordering::SeqCst) >= buffer_limit {
                        drop(decoder_control.wake.wait(demand).unwrap());
                        continue;
                    }
                    let decoded = DecodedFrame {
                        generation: demand.generation,
                        frame,
                        pixels: pixels.take().unwrap(),
                    };
                    counter.fetch_add(1, Ordering::SeqCst);
                    match sender.try_send(decoded) {
                        Ok(()) => break,
                        Err(TrySendError::Full(decoded)) => {
                            counter.fetch_sub(1, Ordering::SeqCst);
                            pixels = Some(decoded.pixels);
                            drop(decoder_control.wake.wait(demand).unwrap());
                        }
                        Err(TrySendError::Disconnected(_)) => {
                            counter.fetch_sub(1, Ordering::SeqCst);
                            return;
                        }
                    }
                }
                frame += 1;
            }
        });
        stream.receiver = Some(receiver);
        stream.ready.clear();
        stream.pending = None;
        stream.buffered = buffered;
        stream.decoder = Some(decoder);
        stream.cancellation = cancellation;
        stream.control = control;
    }

    fn retarget(&mut self, index: usize, first_frame: i64) {
        let generation = self.generation;
        let stream = &mut self.streams[index];
        stream.control.retarget(generation, first_frame);

        let mut decoded = Vec::new();
        decoded.extend(stream.pending.take());
        decoded.extend(stream.ready.drain(..));
        let mut disconnected = false;
        if let Some(receiver) = stream.receiver.as_ref() {
            loop {
                match receiver.try_recv() {
                    Ok(frame) => decoded.push(frame),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        disconnected = true;
                        break;
                    }
                }
            }
        }
        stream.control.notify();

        decoded.sort_by_key(|frame| frame.frame);
        for mut frame in decoded {
            if frame.frame < first_frame {
                stream.buffered.fetch_sub(1, Ordering::SeqCst);
                stream.control.notify();
                continue;
            }
            frame.generation = generation;
            stream.ready.push_back(frame);
        }
        if disconnected {
            if let Some(handle) = stream.decoder.take() {
                self.retiring.push(handle);
            }
        }
    }

    /// Drop a clip's queue and interrupt a decoder blocked in a read. Nothing is
    /// joined here because a seek must not wait for a decoder mid-frame.
    fn retire(&mut self, index: usize) {
        let stream = &mut self.streams[index];
        stream.cancellation.cancel();
        stream.control.notify();
        stream.receiver = None;
        stream.ready.clear();
        stream.pending = None;
        stream.buffered = Arc::new(AtomicUsize::new(0));
        stream.control = Arc::new(DecoderControl::new(self.generation, self.position));
        let decoder = stream.decoder.take();
        if let Some(handle) = decoder {
            self.retiring.push(handle);
        }
    }

    /// Join the retired threads that have already ended, so a long soak with
    /// many seeks does not accumulate them.
    fn reap(&mut self) {
        let mut index = 0;
        while index < self.retiring.len() {
            if self.retiring[index].is_finished() {
                let _ = self.retiring.swap_remove(index).join();
            } else {
                index += 1;
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use makevideo_render::{Asset, Clip, ProjectSettings, Track, TrackKind, FORMAT_VERSION};
    use std::sync::atomic::AtomicU64;
    use std::sync::Condvar;

    /// A source that hands back frames tagged with the clip and the frame
    /// number, so a test can assert *which* frame arrived rather than only that
    /// one did.
    struct Fake {
        tag: u8,
        index: i64,
        first: i64,
        frames: i64,
        delay: Duration,
    }

    impl FrameReader for Fake {
        fn read(&mut self, buffer: &mut [u8]) -> bool {
            if self.index >= self.frames {
                return false;
            }
            if !self.delay.is_zero() {
                std::thread::sleep(self.delay);
            }
            let source_frame = self.first + self.index;
            buffer.fill(self.tag);
            buffer[0] = source_frame as u8;
            self.index += 1;
            true
        }
    }

    #[derive(Default)]
    struct Fakes {
        opened: Mutex<Vec<Open>>,
        /// Paths that cannot be opened at all.
        missing: Vec<String>,
        /// Path to how long each frame takes.
        slow: Vec<(String, Duration)>,
        /// Path to how many frames it really has.
        short: Vec<(String, i64)>,
    }

    impl Fakes {
        fn opens(&self) -> Vec<Open> {
            self.opened.lock().unwrap().clone()
        }
    }

    impl Readers for Fakes {
        fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>> {
            self.opened.lock().unwrap().push(request.clone());
            if self.missing.iter().any(|path| *path == request.path) {
                return None;
            }
            let delay = self
                .slow
                .iter()
                .find(|(path, _)| *path == request.path)
                .map(|(_, delay)| *delay)
                .unwrap_or_default();
            let frames = self
                .short
                .iter()
                .find(|(path, _)| *path == request.path)
                .map(|(_, frames)| (*frames - request.in_frame).max(0))
                .unwrap_or(request.frames)
                .min(request.frames);
            Some(Box::new(Fake {
                tag: request.path.bytes().last().unwrap_or(b'0'),
                index: 0,
                first: request.in_frame,
                frames,
                delay,
            }))
        }
    }

    struct Blocking {
        stopped: Arc<(Mutex<bool>, Condvar)>,
        reading: Arc<AtomicBool>,
    }

    impl FrameReader for Blocking {
        fn read(&mut self, _buffer: &mut [u8]) -> bool {
            self.reading.store(true, Ordering::SeqCst);
            let (lock, wake) = &*self.stopped;
            let mut stopped = lock.lock().unwrap();
            while !*stopped {
                stopped = wake.wait(stopped).unwrap();
            }
            false
        }

        fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
            Some(Arc::new(Unblock(Arc::clone(&self.stopped))))
        }
    }

    struct Unblock(Arc<(Mutex<bool>, Condvar)>);

    impl CancelRead for Unblock {
        fn cancel(&self) {
            let (lock, wake) = &*self.0;
            *lock.lock().unwrap() = true;
            wake.notify_all();
        }
    }

    struct BlockingReaders {
        stopped: Arc<(Mutex<bool>, Condvar)>,
        reading: Arc<AtomicBool>,
    }

    #[derive(Default)]
    struct FakeLifecycleClock {
        millis: AtomicU64,
    }

    impl FakeLifecycleClock {
        fn advance(&self, millis: u64) {
            self.millis.fetch_add(millis, Ordering::SeqCst);
        }
    }

    impl LifecycleClock for FakeLifecycleClock {
        fn now(&self) -> Duration {
            Duration::from_millis(self.millis.load(Ordering::SeqCst))
        }
    }

    impl Readers for BlockingReaders {
        fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
            Some(Box::new(Blocking {
                stopped: Arc::clone(&self.stopped),
                reading: Arc::clone(&self.reading),
            }))
        }
    }

    fn asset(id: &str) -> Asset {
        Asset {
            id: id.into(),
            path: format!("/m/{id}"),
            name: id.into(),
            kind: AssetKind::Video,
            duration_ms: 60_000,
            width: 16,
            height: 16,
            has_audio: false,
        }
    }

    fn clip(id: &str, asset_id: &str, start: i64, in_point: i64, out_point: i64) -> Clip {
        Clip {
            id: id.into(),
            asset_id: asset_id.into(),
            link_group: None,
            lut_path: None,
            start,
            in_point,
            out_point,
            volume: 1.0,
            opacity: 1.0,
        }
    }

    fn project(tracks: Vec<Track>, assets: Vec<Asset>) -> Project {
        Project {
            version: FORMAT_VERSION,
            settings: ProjectSettings {
                width: 16,
                height: 16,
                rate: Rate::fps(30),
            },
            assets,
            tracks,
            markers: Vec::new(),
        }
    }

    fn track(id: &str, clips: Vec<Clip>) -> Track {
        Track {
            id: id.into(),
            kind: TrackKind::Video,
            name: id.into(),
            clips,
            visual_items: Vec::new(),
            subtitle_style: None,
            muted: false,
            hidden: false,
        }
    }

    /// One clip, one second long, filling a 16x16 frame.
    fn one_clip() -> Project {
        project(
            vec![track("V1", vec![clip("c1", "a1", 0, 0, 30)])],
            vec![asset("a1")],
        )
    }

    fn source(project: &Project, buffering: Buffering, readers: Arc<Fakes>) -> FrameSource {
        FrameSource::new(project, 16, 16, buffering, readers)
    }

    /// Everything here waits on another thread, so every wait is bounded and
    /// fails as a test rather than as a hang.
    fn wait_for(mut ready: impl FnMut() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if ready() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(2));
        }
        false
    }

    fn next(source: &mut FrameSource) -> Frame {
        match source.take_by(Instant::now() + Duration::from_secs(5)) {
            Supply::Ready(frame) => frame,
            other => panic!("wanted a frame, got {other:?}"),
        }
    }

    /// The first byte of a layer is the source frame it was decoded from.
    fn source_frame(frame: &Frame, clip_id: &str) -> u8 {
        frame
            .layers
            .iter()
            .find(|layer| layer.clip_id == clip_id)
            .unwrap_or_else(|| panic!("{clip_id} is not on frame {}", frame.frame))
            .pixels[0]
    }

    /// A shape or a title is part of the frame the source hands over, so the
    /// playback sinks show it without a pass of their own. This is what makes
    /// text visible *during* playback rather than only on the paused still.
    #[test]
    fn a_visual_item_rides_on_the_frames_it_covers() {
        use makevideo_render::{ShapeKind, VisualContent, VisualItem, VisualTransform};
        let mut with_shape = one_clip();
        with_shape.tracks[0].visual_items.push(VisualItem {
            id: "s1".into(),
            start: 0,
            duration: 1,
            z_index: 0,
            transform: VisualTransform {
                x: 2.0,
                y: 2.0,
                width: 8.0,
                height: 8.0,
                rotation: 0.0,
                opacity: 1.0,
            },
            content: VisualContent::Shape {
                shape: ShapeKind::Rectangle,
                fill: "#ff0000".into(),
                stroke: "#ffffff".into(),
                stroke_width: 1.0,
                corner_radius: 0.0,
                start_arrow: false,
                end_arrow: false,
            },
        });
        let mut source = source(
            &with_shape,
            Buffering::default(),
            Arc::new(Fakes::default()),
        );
        let covered = next(&mut source);
        assert_eq!(covered.sources().len(), 2, "the clip and the shape");
        let video_bytes = 16 * 16 * 4;
        let visual_bytes = 8 * 8 * 4;
        assert_eq!(covered.visuals[0].pixels.len(), visual_bytes);
        assert_eq!(source.frame_ceiling(), video_bytes + visual_bytes);
        assert_eq!(
            source.buffer_ceiling(),
            (source.buffering.depth + 2) * video_bytes + visual_bytes
        );
        let decoded_bytes = source.buffered_bytes();
        source.seek_neighbor = Some(covered);
        assert_eq!(
            source.buffered_bytes(),
            decoded_bytes + video_bytes + visual_bytes,
            "a retained seek frame counts both clip and visual pixels"
        );
        source.seek_neighbor = None;
        let after = next(&mut source);
        assert_eq!(after.sources().len(), 1, "the shape has ended");
    }

    #[test]
    fn every_frame_of_the_timeline_comes_out_once_and_in_order() {
        let project = one_clip();
        let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
        for expected in 0..30 {
            let frame = next(&mut source);
            assert_eq!(frame.frame, expected);
            assert_eq!(source_frame(&frame, "c1"), expected as u8);
        }
        assert!(matches!(source.take(), Supply::End));
    }

    #[test]
    fn a_clip_is_decoding_before_the_playhead_reaches_it() {
        // The point of the lead: a decoder started on the frame the clip
        // appears makes that frame late by a process spawn.
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 20, 0, 40)])],
            vec![asset("a1")],
        );
        let readers = Arc::new(Fakes::default());
        let mut source = source(&project, Buffering::new(4, 10), Arc::clone(&readers));
        assert!(source.decoding().is_empty(), "nothing is due yet");

        // The decoder is started by the poll at frame 10, ten frames before the
        // clip is on screen.
        for _ in 0..11 {
            let frame = next(&mut source);
            assert!(frame.layers.is_empty(), "the clip has not started");
        }
        assert_eq!(source.decoding(), vec!["c1"], "ten frames of lead");
        assert!(
            wait_for(|| source.buffered_frames() > 0),
            "the queue should be filling before the clip is on screen"
        );
    }

    #[test]
    fn a_decoder_reads_from_the_clip_in_point_not_the_timeline() {
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 10, 45, 75)])],
            vec![asset("a1")],
        );
        let readers = Arc::new(Fakes::default());
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        let frame = next(&mut source);
        assert!(frame.layers.is_empty(), "frame 0 is before the clip");
        // The open happens on the decoder's own thread, which is the point of
        // it: a process spawn on this side would be a stall on the playhead.
        assert!(
            wait_for(|| !readers.opens().is_empty()),
            "no decoder started"
        );
        assert_eq!(readers.opens()[0].in_frame, 45);
        assert_eq!(readers.opens()[0].frames, 30, "the clip's own length");
    }

    #[test]
    fn nothing_is_consumed_when_one_clip_is_not_ready() {
        // The reason a starved poll hands back nothing at all: consuming the
        // ready clips would tear the frame, showing clip A at frame 12 next to
        // clip B at frame 11 for the rest of the timeline.
        let project = project(
            vec![
                track("V1", vec![clip("c1", "a1", 0, 0, 30)]),
                track("V2", vec![clip("c2", "a2", 0, 0, 30)]),
            ],
            vec![asset("a1"), asset("a2")],
        );
        let readers = Arc::new(Fakes {
            slow: vec![("/m/a2".into(), Duration::from_millis(40))],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::new(2, 0), Arc::clone(&readers));

        let mut starved = 0;
        loop {
            match source.take() {
                Supply::Starved => {
                    starved += 1;
                    assert_eq!(source.position(), 0, "the playhead did not move");
                    std::thread::sleep(Duration::from_millis(2));
                }
                Supply::Ready(frame) => {
                    assert_eq!(frame.layers.len(), 2, "both clips, same instant");
                    assert_eq!(source_frame(&frame, "c1"), 0);
                    assert_eq!(source_frame(&frame, "c2"), 0);
                    break;
                }
                Supply::End => panic!("the timeline is 30 frames long"),
            }
        }
        assert!(starved > 0, "the slow clip should have starved a poll");
    }

    #[test]
    fn the_fast_clip_keeps_filling_while_the_slow_one_is_late() {
        // What the threads buy. In the synchronous loop the fast decoder sat
        // idle waiting to be read; here it uses the time to get ahead, which is
        // what absorbs the next hiccup.
        let project = project(
            vec![
                track("V1", vec![clip("c1", "a1", 0, 0, 60)]),
                track("V2", vec![clip("c2", "a2", 0, 0, 60)]),
            ],
            vec![asset("a1"), asset("a2")],
        );
        let readers = Arc::new(Fakes {
            slow: vec![("/m/a2".into(), Duration::from_millis(20))],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::new(5, 0), Arc::clone(&readers));
        next(&mut source);
        assert!(
            wait_for(|| source.buffered_frames() >= 4),
            "the fast clip should have run ahead, buffered {}",
            source.buffered_frames()
        );
    }

    #[test]
    fn the_queue_never_grows_past_its_depth() {
        let project = one_clip();
        let mut source = source(&project, Buffering::new(3, 0), Arc::new(Fakes::default()));
        next(&mut source);
        // The decoder is given time to overfill if it can. One frame may sit
        // outside the queue as the pending slot, so the bound is depth + 1.
        std::thread::sleep(Duration::from_millis(50));
        assert!(
            source.buffered_frames() <= 4,
            "buffered {} frames on a depth of 3",
            source.buffered_frames()
        );
        assert_eq!(
            source.buffered_bytes(),
            source.buffered_frames() * 16 * 16 * 4
        );
    }

    #[test]
    fn a_source_that_cannot_be_opened_only_stops_its_own_clip() {
        let project = project(
            vec![
                track("V1", vec![clip("c1", "a1", 0, 0, 30)]),
                track("V2", vec![clip("c2", "gone", 0, 0, 30)]),
            ],
            vec![asset("a1"), asset("gone")],
        );
        let readers = Arc::new(Fakes {
            missing: vec!["/m/gone".into()],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        for expected in 0..30 {
            let frame = next(&mut source);
            assert_eq!(frame.frame, expected);
            assert_eq!(frame.layers.len(), 1, "the clip that is there still draws");
            assert_eq!(frame.layers[0].clip_id, "c1");
        }
    }

    #[test]
    fn the_ceiling_counts_the_clips_that_can_buffer_at_once_not_all_of_them() {
        // Three clips one after another on one track. Only one of them is ever
        // buffering, so summing all three would be a bound nothing can reach
        // and a limit that catches nothing.
        let sequence = project(
            vec![track(
                "V1",
                vec![
                    clip("c1", "a1", 0, 0, 30),
                    clip("c2", "a1", 30, 0, 30),
                    clip("c3", "a1", 60, 0, 30),
                ],
            )],
            vec![asset("a1")],
        );
        let one_frame = 16 * 16 * 4;
        let sequential = source(&sequence, Buffering::new(3, 0), Arc::new(Fakes::default()));
        assert_eq!(
            sequential.buffer_ceiling(),
            5 * one_frame,
            "depth, pending, and one retained seek neighbor"
        );

        // Two tracks that overlap are two queues at once, and a lead makes the
        // next clip's queue overlap the one before it.
        let stacked = project(
            vec![
                track("V1", vec![clip("c1", "a1", 0, 0, 30)]),
                track("V2", vec![clip("c2", "a2", 0, 0, 30)]),
            ],
            vec![asset("a1"), asset("a2")],
        );
        let overlapping = source(&stacked, Buffering::new(3, 0), Arc::new(Fakes::default()));
        assert_eq!(overlapping.buffer_ceiling(), 10 * one_frame);
        let led = source(&sequence, Buffering::new(3, 5), Arc::new(Fakes::default()));
        assert_eq!(led.buffer_ceiling(), 10 * one_frame, "the lead overlaps");
    }

    #[test]
    fn a_dead_decoder_is_retired_where_it_died() {
        // Its thread ended when the source did. Holding the handle until the
        // clip is over would report a decoder that is not running for as long
        // as the clip lasts.
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 0, 0, 300)])],
            vec![asset("a1")],
        );
        let readers = Arc::new(Fakes {
            short: vec![("/m/a1".into(), 3)],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        for _ in 0..4 {
            next(&mut source);
        }
        assert!(
            source.decoding().is_empty(),
            "the source ran out three frames in"
        );
    }

    #[test]
    fn a_source_that_ends_early_stops_drawing_and_the_timeline_runs_on() {
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 0, 0, 30)])],
            vec![asset("a1")],
        );
        let readers = Arc::new(Fakes {
            short: vec![("/m/a1".into(), 10)],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        for _ in 0..10 {
            assert_eq!(next(&mut source).layers.len(), 1);
        }
        for expected in 10..30 {
            let frame = next(&mut source);
            assert_eq!(frame.frame, expected);
            assert!(frame.layers.is_empty(), "a hole, not a stall");
        }
        assert!(matches!(source.take(), Supply::End));
    }

    #[test]
    fn a_short_forward_seek_reuses_the_live_decoder() {
        let project = one_clip();
        let readers = Arc::new(Fakes::default());
        let mut source = source(&project, Buffering::new(6, 0), Arc::clone(&readers));
        next(&mut source);
        assert!(wait_for(|| source.buffered_frames() > 1));

        source.seek(20);
        assert_eq!(source.position(), 20);
        let frame = next(&mut source);
        assert_eq!(frame.frame, 20);
        assert_eq!(
            source_frame(&frame, "c1"),
            20,
            "queued frames before the target must not be shown"
        );
        let opened = readers.opens();
        assert_eq!(opened.len(), 1, "the live decoder advances in place");
    }

    #[test]
    fn a_large_forward_seek_reopens_the_decoder() {
        let project = one_clip();
        let readers = Arc::new(Fakes::default());
        let mut source = source(&project, Buffering::new(2, 0), Arc::clone(&readers));
        next(&mut source);

        source.seek_exact(MAX_FORWARD_SEEK + 2);
        assert_eq!(next(&mut source).frame, MAX_FORWARD_SEEK + 2);
        let opened = readers.opens();
        assert_eq!(opened.len(), 2);
        assert_eq!(opened[1].in_frame, MAX_FORWARD_SEEK + 2);
    }

    #[test]
    fn a_seek_offers_only_real_frames_one_or_two_behind_the_target() {
        let project = one_clip();
        let mut source = source(&project, Buffering::new(3, 0), Arc::new(Fakes::default()));
        source.position = 20;
        source.generation = 7;
        source.seek_probe = Some(18);
        let (_sender, receiver) = sync_channel(3);
        source.streams[0].receiver = Some(receiver);

        for expected in [18, 19] {
            source.streams[0].ready.push_back(DecodedFrame {
                generation: 7,
                frame: expected,
                pixels: vec![expected as u8; 16 * 16 * 4],
            });
            source.streams[0].buffered.fetch_add(1, Ordering::SeqCst);
            assert!(matches!(source.take(), Supply::Starved));
            assert_eq!(
                source.buffered_frames(),
                1,
                "the retained neighbor is included in source accounting"
            );
            let neighbor = source
                .take_neighbor_before(20, SEEK_NEIGHBOR_FRAMES)
                .expect("current-generation neighbor");
            assert_eq!(source.buffered_frames(), 0);
            assert_eq!(neighbor.frame, expected);
            assert_eq!(source_frame(&neighbor, "c1"), expected as u8);
            assert_eq!(source.position(), 20, "the logical target stays exact");
        }

        source.streams[0].ready.push_back(DecodedFrame {
            generation: 7,
            frame: 20,
            pixels: vec![20; 16 * 16 * 4],
        });
        source.streams[0].buffered.fetch_add(1, Ordering::SeqCst);
        let Supply::Ready(exact) = source.take() else {
            panic!("exact frame did not replace the neighbor");
        };
        assert_eq!(exact.frame, 20);
        assert_eq!(source_frame(&exact, "c1"), 20);
        assert_eq!(source.buffered_frames(), 0);
    }

    #[test]
    fn neighbor_boundary_rejects_three_behind_and_future_frames() {
        let project = one_clip();
        let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
        source.position = 20;
        for allowed in [19, 18] {
            source.seek_neighbor = Some(Frame {
                frame: allowed,
                layers: Vec::new(),
                visuals: Vec::new(),
            });
            assert_eq!(
                source
                    .take_neighbor_before(20, SEEK_NEIGHBOR_FRAMES)
                    .map(|frame| frame.frame),
                Some(allowed)
            );
        }
        for forbidden in [17, 20, 21] {
            source.seek_neighbor = Some(Frame {
                frame: forbidden,
                layers: Vec::new(),
                visuals: Vec::new(),
            });
            assert!(source
                .take_neighbor_before(20, SEEK_NEIGHBOR_FRAMES)
                .is_none());
        }
    }

    #[test]
    fn a_stale_generation_cannot_become_an_exact_or_neighbor_frame() {
        let project = one_clip();
        let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
        source.generation = 2;
        source.position = 10;
        source.streams[0].ready.push_back(DecodedFrame {
            generation: 1,
            frame: 10,
            pixels: vec![10; 16 * 16 * 4],
        });
        source.streams[0].buffered.store(1, Ordering::SeqCst);

        assert!(matches!(source.take_frame(10), Supply::Starved));
        assert_eq!(source.streams[0].buffered.load(Ordering::SeqCst), 0);
        assert!(source
            .take_neighbor_before(10, SEEK_NEIGHBOR_FRAMES)
            .is_none());
    }

    #[test]
    fn an_idle_decoder_is_released_after_the_timeout_and_can_reopen() {
        let project = one_clip();
        let readers = Arc::new(Fakes::default());
        let clock = Arc::new(FakeLifecycleClock::default());
        let lifecycle_clock: Arc<dyn LifecycleClock> = clock.clone();
        let mut source = FrameSource::new_with_clock(
            &project,
            16,
            16,
            Buffering::new(2, 0),
            Arc::clone(&readers) as Arc<dyn Readers>,
            lifecycle_clock,
            Duration::from_millis(100),
        );
        assert_eq!(source.decoder_lifecycle(), DecoderLifecycle::Released);
        next(&mut source);
        assert_eq!(source.decoder_lifecycle(), DecoderLifecycle::Running);

        source.seek_neighbor = Some(Frame {
            frame: 0,
            layers: vec![Layer {
                clip_id: "c1".into(),
                pixels: vec![0; 16 * 16 * 4],
                dst: source.streams[0].placement.dst,
                opacity: 1.0,
                lut: None,
            }],
            visuals: Vec::new(),
        });
        source.idle_decoders();
        assert_eq!(source.decoder_lifecycle(), DecoderLifecycle::Idle);
        clock.advance(99);
        source.maintain_decoders();
        assert_eq!(source.decoder_lifecycle(), DecoderLifecycle::Idle);
        clock.advance(1);
        source.maintain_decoders();
        let release_deadline = Instant::now() + Duration::from_secs(1);
        while source.decoder_lifecycle() != DecoderLifecycle::Released {
            assert!(
                Instant::now() < release_deadline,
                "the cancelled decoder thread did not release"
            );
            std::thread::sleep(Duration::from_millis(1));
            source.maintain_decoders();
        }
        assert!(source.decoding().is_empty());
        assert_eq!(
            source.buffered_frames(),
            1,
            "the neighbor is a separate slot"
        );
        assert_eq!(
            source
                .take_neighbor_before(1, SEEK_NEIGHBOR_FRAMES)
                .map(|frame| frame.frame),
            Some(0)
        );
        assert_eq!(source.buffered_frames(), 0);

        source.seek_exact(5);
        assert_eq!(source.decoder_lifecycle(), DecoderLifecycle::Running);
        assert!(wait_for(|| readers.opens().len() == 2));
    }

    #[test]
    fn dropping_interrupts_a_reader_blocked_mid_frame() {
        let stopped = Arc::new((Mutex::new(false), Condvar::new()));
        let reading = Arc::new(AtomicBool::new(false));
        let readers = Arc::new(BlockingReaders {
            stopped,
            reading: Arc::clone(&reading),
        });
        let mut source = FrameSource::new(&one_clip(), 16, 16, Buffering::default(), readers);
        assert!(matches!(source.take(), Supply::Starved));
        assert!(wait_for(|| reading.load(Ordering::SeqCst)));

        let (done, finished) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            drop(source);
            let _ = done.send(());
        });
        assert!(finished.recv_timeout(Duration::from_secs(1)).is_ok());
    }

    #[test]
    fn seeking_backwards_revives_a_clip_whose_source_had_run_out() {
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 0, 0, 30)])],
            vec![asset("a1")],
        );
        let readers = Arc::new(Fakes {
            short: vec![("/m/a1".into(), 10)],
            ..Fakes::default()
        });
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        for _ in 0..15 {
            next(&mut source);
        }
        source.seek(0);
        assert_eq!(next(&mut source).layers.len(), 1, "it draws again");
        assert_eq!(readers.opens().len(), 2, "backward seek reopens");
    }

    #[test]
    fn seeking_past_the_end_lands_on_the_end() {
        let project = one_clip();
        let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
        source.seek(9_000);
        assert_eq!(source.position(), 30);
        assert!(matches!(source.take(), Supply::End));
        source.seek(-5);
        assert_eq!(source.position(), 0);
    }

    #[test]
    fn layers_come_back_bottom_track_first() {
        let project = project(
            vec![
                track("V1", vec![clip("c1", "a1", 0, 0, 30)]),
                track("V2", vec![clip("c2", "a2", 0, 0, 30)]),
            ],
            vec![asset("a1"), asset("a2")],
        );
        let mut source = source(&project, Buffering::default(), Arc::new(Fakes::default()));
        let frame = next(&mut source);
        let ids: Vec<&str> = frame
            .layers
            .iter()
            .map(|layer| layer.clip_id.as_str())
            .collect();
        assert_eq!(ids, vec!["c1", "c2"]);
        assert_eq!(frame.sources().len(), 2);
    }

    #[test]
    fn a_decoder_is_stopped_when_its_clip_is_over() {
        let project = project(
            vec![track("V1", vec![clip("c1", "a1", 0, 0, 10)])],
            vec![asset("a1")],
        );
        // A 10 frame clip on a 10 frame timeline: the decoder retires as the
        // playhead leaves the clip, not when the source is dropped.
        let mut source = source(&project, Buffering::new(2, 0), Arc::new(Fakes::default()));
        for _ in 0..10 {
            next(&mut source);
        }
        assert!(matches!(source.take(), Supply::End));
        assert!(source.decoding().is_empty(), "the decoder was retired");
    }

    #[test]
    fn a_still_is_read_the_same_way_a_clip_is() {
        let mut project = one_clip();
        project.assets[0].kind = AssetKind::Image;
        let readers = Arc::new(Fakes::default());
        let mut source = source(&project, Buffering::default(), Arc::clone(&readers));
        next(&mut source);
        assert_eq!(readers.opens()[0].kind, AssetKind::Image);
    }
}
