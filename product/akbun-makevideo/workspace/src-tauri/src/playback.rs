//! Native playback in the app: one thread, and what it owns.
//!
//! The scheduling is not here. It is `makevideo_present`, which has no window
//! and no tauri, and is measured headless by `present-soak`. What is here is
//! the wiring: a thread, a command channel, the output device, and the surface
//! the frames land on.
//!
//! # Pause keeps the pipeline alive
//!
//! One monitor session owns one transport, its decoder processes and its audio
//! output for its entire lifetime. Pause closes an atomic gate in the device
//! callback and stops the scheduler clock; it does not drop either half. The
//! callback writes silence while the gate is closed, so no samples leave the
//! ring and the playhead cannot move.
//!
//! # The still is the same picture as the playback
//!
//! Both stages draw through one `Sink` onto one surface with one shader, so the
//! frame under a stopped playhead and the frames during playback are the same
//! compositor. That is what let the live/exact split go: there is nothing left
//! for a badge to tell apart.

use crate::viewport::{MonitorPlace, Viewport};
use makevideo_audio::device::DeviceSink;
use makevideo_audio::engine::Options as AudioOptions;
use makevideo_audio::source::{
    Buffering as AudioBuffering, FfmpegReaders as AudioReaders, DEFAULT_DEPTH as AUDIO_DEPTH,
    DEFAULT_LEAD as AUDIO_LEAD,
};
use makevideo_compositor::source::{Buffering as FrameBuffering, FfmpegReaders as FrameReaders};
use makevideo_compositor::Compositor;
use makevideo_present::player::{Tick, IDLE};
use makevideo_present::schedule::DEFAULT_RESYNC;
use makevideo_present::surface::SurfaceSink;
use makevideo_present::transport::{Setup, Transport};
use makevideo_render::Project;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

/// How long the loop sleeps with nothing to do. Long enough that a paused
/// editor is an idle thread, short enough that play is answered inside a frame.
const REST: Duration = IDLE;

enum Command {
    Play,
    Pause,
    Seek(i64),
    /// The panel moved or the window resized, and the surface is now this many
    /// physical pixels. Carried to the loop rather than done where it was
    /// noticed, because only the thread drawing on a surface may reconfigure
    /// it — and it carries the size rather than the placement, because the size
    /// is what the view answered *after* it was moved, which is the only
    /// reading that accounts for the display it ended up on.
    Resize(u32, u32),
    /// The timeline changed under a paused playhead: redraw the still.
    Redraw,
    Stop,
}

/// What the page reads back. Atomics because the page asks on its own schedule
/// and the loop must never wait for it.
#[derive(Debug, Default)]
pub struct Shared {
    position: AtomicI64,
    playing: AtomicBool,
    /// Set once when the surface refuses. The page shows it and offers the
    /// media element preview; it is not cleared, because a monitor that has
    /// failed once is not something to keep quiet about.
    failed: Mutex<Option<String>>,
}

impl Shared {
    pub fn position(&self) -> i64 {
        self.position.load(Ordering::Relaxed)
    }

    pub fn playing(&self) -> bool {
        self.playing.load(Ordering::Relaxed)
    }

    pub fn failure(&self) -> Option<String> {
        self.failed.lock().unwrap().clone()
    }
}

/// What the page is told about the monitor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub engine: &'static str,
    pub position: i64,
    pub playing: bool,
    /// Frames drawn and frames dropped since this session started.
    pub presented: u64,
    pub skipped: u64,
    pub resynced: u64,
    pub starved: u64,
    pub failed_frames: u64,
    pub last_present_ms: f64,
    pub peak_present_ms: f64,
    pub last_late_ms: f64,
    pub peak_late_ms: f64,
    pub viewport_geometry: String,
    pub failure: Option<String>,
}

/// A running native monitor: the thread, and the handles onto it.
pub struct Session {
    control: Sender<Command>,
    shared: Arc<Shared>,
    counters: Arc<Counters>,
    /// Placement is a main thread call and the loop is not on it, so the
    /// viewport is moved and messaged from whichever thread asks. See
    /// `viewport::macos`.
    viewport: Arc<Mutex<Viewport>>,
    thread: Option<JoinHandle<()>>,
}

/// Totals that outlive a play, so pausing does not reset what the page shows.
#[derive(Debug, Default)]
struct Counters {
    presented: AtomicU64,
    skipped: AtomicU64,
    resynced: AtomicU64,
    starved: AtomicU64,
    failed_frames: AtomicU64,
    last_present_us: AtomicU64,
    peak_present_us: AtomicU64,
    last_late_us: AtomicI64,
    peak_late_us: AtomicI64,
}

impl Counters {
    fn record_present(&self, present_ms: f64, late_ms: f64) {
        let present_us = micros(present_ms);
        let late_us = signed_micros(late_ms);
        self.last_present_us.store(present_us, Ordering::Relaxed);
        self.last_late_us.store(late_us, Ordering::Relaxed);
        self.peak_present_us
            .fetch_max(present_us, Ordering::Relaxed);
        self.peak_late_us
            .fetch_max(late_us.max(0), Ordering::Relaxed);
    }
}

fn micros(milliseconds: f64) -> u64 {
    (milliseconds.max(0.0) * 1000.0).round() as u64
}

fn signed_micros(milliseconds: f64) -> i64 {
    (milliseconds * 1000.0).round() as i64
}

fn milliseconds(micros: u64) -> f64 {
    micros as f64 / 1000.0
}

fn signed_milliseconds(micros: i64) -> f64 {
    micros as f64 / 1000.0
}

/// Everything the loop needs that does not change while it runs.
pub struct Config {
    pub compositor: Arc<Compositor>,
    pub ffmpeg: String,
    pub width: u32,
    pub height: u32,
    pub frame_buffering: FrameBuffering,
    pub audio_buffering: AudioBuffering,
    pub resync_after: i64,
    pub proxy_paths: HashMap<String, String>,
    pub hwaccel: Option<String>,
}

impl Config {
    pub fn new(compositor: Arc<Compositor>, ffmpeg: String, width: u32, height: u32) -> Config {
        Config {
            compositor,
            ffmpeg,
            width,
            height,
            frame_buffering: FrameBuffering::default(),
            audio_buffering: AudioBuffering::new(AUDIO_DEPTH, AUDIO_LEAD),
            resync_after: DEFAULT_RESYNC,
            proxy_paths: HashMap::new(),
            hwaccel: None,
        }
    }

    pub fn with_proxies(mut self, proxy_paths: HashMap<String, String>) -> Config {
        self.proxy_paths = proxy_paths;
        self
    }

    pub fn with_hwaccel(mut self, hwaccel: Option<String>) -> Config {
        self.hwaccel = hwaccel;
        self
    }
}

impl Session {
    /// Attach a view, make a surface on it, and start the loop paused at
    /// `frame`.
    ///
    /// Every failure is a reason string and the caller turns it into the media
    /// element fallback. Nothing here panics and nothing half starts: a session
    /// that returns `Err` has left no thread and no view behind.
    pub fn start(
        window: &tauri::WebviewWindow,
        document: Arc<Mutex<makevideo_edit::Document>>,
        config: Config,
        place: MonitorPlace,
        frame: i64,
    ) -> Result<Session, String> {
        if config.compositor.gpu().is_none() {
            return Err("this machine has no graphics device, so the monitor cannot draw".into());
        }
        let viewport = Viewport::attach(window, place)?;
        let (surface_width, surface_height) = viewport.surface_size();
        let sink = SurfaceSink::new(
            Arc::clone(&config.compositor),
            viewport.target()?,
            surface_width,
            surface_height,
            config.width,
            config.height,
        )?;

        let shared = Arc::new(Shared::default());
        let counters = Arc::new(Counters::default());
        let (control, commands) = channel();
        let project = makevideo_proxy::playback_project(
            document.lock().unwrap().project(),
            &config.proxy_paths,
        );

        let thread = {
            let (shared, counters) = (Arc::clone(&shared), Arc::clone(&counters));
            std::thread::spawn(move || {
                run(Loop {
                    document,
                    config,
                    sink,
                    commands,
                    shared,
                    counters,
                    project,
                    frame,
                })
            })
        };

        Ok(Session {
            control,
            shared,
            counters,
            viewport: Arc::new(Mutex::new(viewport)),
            thread: Some(thread),
        })
    }

    pub fn play(&self) {
        let _ = self.control.send(Command::Play);
    }

    pub fn pause(&self) {
        let _ = self.control.send(Command::Pause);
    }

    pub fn seek(&self, frame: i64) {
        let _ = self.control.send(Command::Seek(frame));
    }

    pub fn redraw(&self) {
        let _ = self.control.send(Command::Redraw);
    }

    /// The panel moved or the window resized.
    ///
    /// Two halves on two threads. The view is moved here, because AppKit wants
    /// the main thread; the swapchain is resized by the loop at the top of its
    /// next frame, because only the thread drawing on a surface may reconfigure
    /// it. Doing the second one here would be a data race wgpu cannot see.
    pub fn place(&self, place: MonitorPlace) {
        let resized = self.viewport.lock().unwrap().place(place);
        if let Some((width, height)) = resized {
            let _ = self.control.send(Command::Resize(width, height));
        }
    }

    /// Show or hide the view. The page hides it before drawing anything over
    /// the stage, because a native view is not in the page's stacking order.
    ///
    /// Only the view moves. The loop keeps drawing, so what is behind a sheet
    /// stays live and the picture does not have to be rebuilt when it closes.
    pub fn set_visible(&self, visible: bool) {
        self.viewport.lock().unwrap().set_visible(visible);
    }

    pub fn status(&self) -> Status {
        Status {
            engine: "native",
            position: self.shared.position(),
            playing: self.shared.playing(),
            presented: self.counters.presented.load(Ordering::Relaxed),
            skipped: self.counters.skipped.load(Ordering::Relaxed),
            resynced: self.counters.resynced.load(Ordering::Relaxed),
            starved: self.counters.starved.load(Ordering::Relaxed),
            failed_frames: self.counters.failed_frames.load(Ordering::Relaxed),
            last_present_ms: milliseconds(self.counters.last_present_us.load(Ordering::Relaxed)),
            peak_present_ms: milliseconds(self.counters.peak_present_us.load(Ordering::Relaxed)),
            last_late_ms: signed_milliseconds(self.counters.last_late_us.load(Ordering::Relaxed)),
            peak_late_ms: signed_milliseconds(self.counters.peak_late_us.load(Ordering::Relaxed)),
            viewport_geometry: self.viewport.lock().unwrap().debug_geometry(),
            failure: self.shared.failure(),
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.control.send(Command::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        // The view goes last. The surface lives on the loop's thread and the
        // join above is what proves it is gone, so this cannot pull a window
        // out from under a swapchain.
    }
}

struct Loop {
    document: Arc<Mutex<makevideo_edit::Document>>,
    config: Config,
    sink: SurfaceSink,
    commands: Receiver<Command>,
    shared: Arc<Shared>,
    counters: Arc<Counters>,
    project: Project,
    frame: i64,
}

/// Decoder, audio mixer and output device that survive play/pause toggles.
struct Pipeline {
    transport: Transport,
    /// Held for the whole monitor lifetime. Its callback emits silence when
    /// `active` is false instead of consuming the ring.
    _device: DeviceSink,
    active: Arc<AtomicBool>,
}

fn run(mut state: Loop) {
    let frame = state.frame;
    let mut current = pipeline(&mut state, frame);
    loop {
        match state.commands.try_recv() {
            Ok(Command::Stop) | Err(TryRecvError::Disconnected) => break,
            Ok(Command::Play) => {
                current.active.store(true, Ordering::Relaxed);
                current.transport.play();
                state.shared.playing.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Pause) => {
                current.active.store(false, Ordering::Relaxed);
                current.transport.pause();
                state.shared.playing.store(false, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Seek(frame)) => {
                current.transport.seek(frame);
                state.shared.position.store(frame, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Resize(width, height)) => {
                state.sink.resize(width, height);
                continue;
            }
            Ok(Command::Redraw) => {
                if !current.transport.is_playing() {
                    let at = current.transport.position();
                    current.active.store(false, Ordering::Relaxed);
                    state.project = makevideo_proxy::playback_project(
                        state.document.lock().unwrap().project(),
                        &state.config.proxy_paths,
                    );
                    current = pipeline(&mut state, at);
                }
                continue;
            }
            Err(TryRecvError::Empty) => {}
        }

        let tick = current.transport.tick(&mut state.sink);
        state
            .shared
            .position
            .store(current.transport.position(), Ordering::Relaxed);

        match tick {
            Tick::Presented {
                present_ms,
                late_ms,
                ..
            } => {
                state.counters.presented.fetch_add(1, Ordering::Relaxed);
                state.counters.record_present(present_ms, late_ms);
            }
            Tick::Skipped { .. } => {
                state.counters.skipped.fetch_add(1, Ordering::Relaxed);
            }
            Tick::Held { wait } => {
                if !wait.is_zero() {
                    std::thread::sleep(wait);
                }
            }
            Tick::Starved => {
                state.counters.starved.fetch_add(1, Ordering::Relaxed);
                std::thread::sleep(Duration::from_millis(1));
            }
            Tick::Idle => std::thread::sleep(REST),
            Tick::Ended => {
                // The timeline is over. Stop where it ended and leave the last
                // frame up, which is what the transport does anyway; going back
                // to the top would lose the place somebody was working at.
                if current.transport.is_playing() {
                    current.active.store(false, Ordering::Relaxed);
                    current.transport.pause();
                    state.shared.playing.store(false, Ordering::Relaxed);
                }
            }
            Tick::Failed { reason } => {
                state.counters.failed_frames.fetch_add(1, Ordering::Relaxed);
                // Recorded once and then carried on with. A frame that could
                // not be drawn is a frame missing from the screen, and stopping
                // the sound as well would make a bad monitor into a broken app.
                let mut slot = state.shared.failed.lock().unwrap();
                if slot.is_none() {
                    *slot = Some(reason);
                }
                std::thread::sleep(REST);
            }
            Tick::Resynced { .. } => {
                state.counters.resynced.fetch_add(1, Ordering::Relaxed);
            }
        }
    }
}

fn pipeline(state: &mut Loop, frame: i64) -> Pipeline {
    let (mut transport, consumer) = Transport::start(Setup {
        project: &state.project,
        width: state.config.width,
        height: state.config.height,
        frame_buffering: state.config.frame_buffering,
        frame_readers: Arc::new(FrameReaders::new(
            &state.config.ffmpeg,
            state.config.hwaccel.as_deref(),
        )),
        audio_buffering: state.config.audio_buffering,
        audio_readers: Arc::new(AudioReaders::new(&state.config.ffmpeg)),
        audio: AudioOptions::default(),
        resync_after: state.config.resync_after,
    });
    let clock = Arc::clone(transport.audio().clock());
    // Seek before the device opens, so the first samples anybody hears are the
    // ones at the playhead rather than the top of the timeline.
    if frame > 0 {
        transport.seek(frame);
    }
    let active = Arc::new(AtomicBool::new(false));
    let device = DeviceSink::open(consumer, clock, Arc::clone(&active));
    Pipeline {
        transport,
        _device: device,
        active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The page reads a session's numbers while the loop writes them, so the
    /// shape has to be shareable without a lock on the hot path.
    #[test]
    fn shared_state_starts_empty_and_is_readable() {
        let shared = Shared::default();
        assert_eq!(shared.position(), 0);
        assert!(!shared.playing());
        assert_eq!(shared.failure(), None);
    }

    fn assert_send_sync<T: Send + Sync>() {}

    /// The loop writes these from its own thread and the command handlers read
    /// them from tauri's. If this stops compiling, something that is not safe
    /// to share got into the struct.
    #[test]
    fn shared_state_crosses_threads() {
        assert_send_sync::<Shared>();
        assert_send_sync::<Counters>();
    }

    #[test]
    fn counters_keep_the_latest_and_peak_playback_measurements() {
        let counters = Counters::default();
        counters.record_present(4.25, -1.5);
        counters.record_present(2.0, 8.75);

        assert_eq!(counters.last_present_us.load(Ordering::Relaxed), 2_000);
        assert_eq!(counters.peak_present_us.load(Ordering::Relaxed), 4_250);
        assert_eq!(counters.last_late_us.load(Ordering::Relaxed), 8_750);
        assert_eq!(counters.peak_late_us.load(Ordering::Relaxed), 8_750);
    }
}
