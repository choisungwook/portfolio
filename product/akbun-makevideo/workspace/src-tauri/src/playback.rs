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
use makevideo_compositor::source::{
    Buffering as FrameBuffering, FfmpegReaders as FrameReaders, Frame, Layer,
};
use makevideo_compositor::Compositor;
use makevideo_present::player::{Sink, Tick, IDLE};
use makevideo_present::schedule::DEFAULT_RESYNC;
use makevideo_present::surface::{Guides, PresentOutcome, SurfaceSink};
use makevideo_present::transport::{
    Setup, Transport, VideoReplacement, VideoSetup, PRESENT_DEFERRED, PRESENT_HIDDEN,
};
use makevideo_render::layout::Rect;
use makevideo_render::Project;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

/// How long the loop sleeps with nothing to do. Long enough that a paused
/// editor is an idle thread, short enough that play is answered inside a frame.
const REST: Duration = IDLE;
const RECONFIGURE_TIMEOUT: Duration = Duration::from_secs(5);
pub const EXPLICIT_RECONFIGURE_PENDING: &str =
    "an explicit playback setting is still being applied";
const SETTINGS_SUPERSEDED: &str = "a newer playback configuration superseded this one";

enum Command {
    Play(Sender<()>),
    Pause(Sender<()>),
    Seek(i64, Sender<()>),
    /// The panel moved or the window resized, and the surface is now this many
    /// physical pixels. Carried to the loop rather than done where it was
    /// noticed, because only the thread drawing on a surface may reconfigure
    /// it — and it carries the size rather than the placement, because the size
    /// is what the view answered *after* it was moved, which is the only
    /// reading that accounts for the display it ended up on.
    Resize(u32, u32),
    Show,
    Hide,
    /// The timeline changed under a paused playhead: redraw the still.
    Redraw,
    Reconfigure {
        generation: u64,
        settings_generation: u64,
        config: Config,
        reply: Sender<Result<(), String>>,
    },
    RefreshProxies {
        generation: u64,
        proxy_paths: HashMap<String, String>,
        reply: Sender<Result<(), String>>,
    },
    CancelReconfigure(u64),
    SetGuides {
        generation: u64,
        settings_generation: u64,
        guides: Guides,
        reply: Sender<Result<(), String>>,
    },
    Stop,
}

/// What the page reads back. Atomics because the page asks on its own schedule
/// and the loop must never wait for it.
#[derive(Default)]
pub struct Shared {
    position: AtomicI64,
    playing: AtomicBool,
    generation: AtomicU64,
    requested_generation: AtomicU64,
    reconfiguring: AtomicBool,
    settings_order: SettingsOrder,
    live_config: Mutex<Option<Config>>,
    confirmed_config: Mutex<Option<Config>>,
    /// Set once when the surface refuses. The page shows it and offers the
    /// media element preview; it is not cleared, because a monitor that has
    /// failed once is not something to keep quiet about.
    failed: Mutex<Option<String>>,
}

#[derive(Debug, Default)]
struct SettingsOrder {
    state: Mutex<SettingsOrderState>,
}

#[derive(Debug, Default)]
struct SettingsOrderState {
    latest: u64,
    committed: u64,
    confirmed: u64,
}

impl SettingsOrder {
    fn reserve(&self, generation: u64) {
        let mut state = self.state.lock().unwrap();
        state.latest = state.latest.max(generation);
    }

    fn lock_if_current(&self, generation: u64) -> Option<MutexGuard<'_, SettingsOrderState>> {
        let state = self.state.lock().unwrap();
        if state.latest == generation {
            Some(state)
        } else {
            None
        }
    }

    fn has_unconfirmed(&self) -> bool {
        let state = self.state.lock().unwrap();
        state.committed > state.confirmed
    }
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

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::Relaxed)
    }

    pub fn reconfiguring(&self) -> bool {
        self.reconfiguring.load(Ordering::Relaxed)
    }

    fn initialize_config(&self, config: &Config) {
        *self.live_config.lock().unwrap() = Some(config.clone());
        *self.confirmed_config.lock().unwrap() = Some(config.clone());
    }

    fn set_live_config(&self, config: &Config) {
        *self.live_config.lock().unwrap() = Some(config.clone());
    }

    fn set_confirmed_proxy_paths(&self, config: &Config) {
        let mut confirmed = self.confirmed_config.lock().unwrap();
        if let Some(confirmed) = confirmed.as_mut() {
            confirmed.proxy_paths = if confirmed.proxy_enabled {
                config.proxy_paths.clone()
            } else {
                HashMap::new()
            };
        }
    }
}

/// What the page is told about the monitor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub engine: &'static str,
    pub position: i64,
    pub playing: bool,
    pub generation: u64,
    pub reconfiguring: bool,
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
    /// Shared with the realtime callback so seek, pause and stop can close the
    /// sound gate before the frame loop finishes its current composition.
    active: Arc<AtomicBool>,
    /// Seek/pause requests sent but not yet applied. A frame finishing after
    /// the caller closed `active` must not reopen it while this is non-zero.
    audio_blockers: Arc<AtomicU64>,
    /// Placement is a main thread call and the loop is not on it, so the
    /// viewport is moved and messaged from whichever thread asks. See
    /// `viewport::macos`.
    viewport: Arc<Mutex<Viewport>>,
    thread: Mutex<Option<JoinHandle<()>>>,
    stopped: AtomicBool,
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
#[derive(Clone)]
pub struct Config {
    pub compositor: Arc<Compositor>,
    /// The GPU used only to put a finished frame on the native surface. For a
    /// GPU compositor this is the same object. For CPU composition it uploads
    /// one full-frame RGBA layer, keeping CPU/GPU switches inside one native
    /// playback session.
    pub presenter: Arc<Compositor>,
    pub ffmpeg: String,
    pub width: u32,
    pub height: u32,
    pub frame_buffering: FrameBuffering,
    pub audio_buffering: AudioBuffering,
    pub resync_after: i64,
    pub proxy_paths: HashMap<String, String>,
    pub proxy_enabled: bool,
    pub hwaccel: Option<String>,
    pub guides: Guides,
}

impl Config {
    pub fn new(compositor: Arc<Compositor>, ffmpeg: String, width: u32, height: u32) -> Config {
        makevideo_compositor::text::set_ffmpeg_path(&ffmpeg);
        Config {
            presenter: Arc::clone(&compositor),
            compositor,
            ffmpeg,
            width,
            height,
            frame_buffering: FrameBuffering::default(),
            audio_buffering: AudioBuffering::new(AUDIO_DEPTH, AUDIO_LEAD),
            resync_after: DEFAULT_RESYNC,
            proxy_paths: HashMap::new(),
            proxy_enabled: false,
            hwaccel: None,
            guides: Guides::default(),
        }
    }

    pub fn with_proxies(mut self, proxy_paths: HashMap<String, String>) -> Config {
        self.proxy_paths = proxy_paths;
        self.proxy_enabled = true;
        self
    }

    pub fn with_hwaccel(mut self, hwaccel: Option<String>) -> Config {
        self.hwaccel = hwaccel;
        self
    }

    pub fn with_presenter(mut self, presenter: Arc<Compositor>) -> Config {
        self.presenter = presenter;
        self
    }

    pub fn with_guides(mut self, guides: Guides) -> Config {
        self.guides = guides;
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
        if config.presenter.gpu().is_none() {
            return Err("this machine has no graphics device, so the monitor cannot draw".into());
        }
        let viewport = Viewport::attach(window, place)?;
        let (surface_width, surface_height) = viewport.surface_size();
        let presenter = Arc::clone(&config.presenter);
        let sink = SurfaceSink::new(
            Arc::clone(&presenter),
            viewport.target()?,
            surface_width,
            surface_height,
            config.width,
            config.height,
        )?
        .with_guides(config.guides);

        let shared = Arc::new(Shared::default());
        shared.initialize_config(&config);
        let counters = Arc::new(Counters::default());
        let active = Arc::new(AtomicBool::new(false));
        let audio_blockers = Arc::new(AtomicU64::new(0));
        let (control, commands) = channel();
        let project = makevideo_proxy::playback_project(
            document.lock().unwrap().project(),
            &config.proxy_paths,
        );
        let frame = frame.clamp(0, project.duration_frames());
        shared.position.store(frame, Ordering::Relaxed);

        let thread = {
            let (shared, counters, active, audio_blockers) = (
                Arc::clone(&shared),
                Arc::clone(&counters),
                Arc::clone(&active),
                Arc::clone(&audio_blockers),
            );
            std::thread::spawn(move || {
                run(Loop {
                    document,
                    config,
                    presenter,
                    sink,
                    commands,
                    shared,
                    counters,
                    active,
                    audio_blockers,
                    project,
                    frame,
                    visibility: MonitorVisibility::Visible,
                })
            })
        };

        Ok(Session {
            control,
            shared,
            counters,
            active,
            audio_blockers,
            viewport: Arc::new(Mutex::new(viewport)),
            thread: Mutex::new(Some(thread)),
            stopped: AtomicBool::new(false),
        })
    }

    pub fn play(&self) -> Result<(), String> {
        self.acknowledged_command(Command::Play)
    }

    pub fn pause(&self) -> Result<(), String> {
        self.acknowledged_muting_command(Command::Pause)
    }

    pub fn seek(&self, frame: i64) -> Result<(), String> {
        self.acknowledged_muting_command(|reply| Command::Seek(frame, reply))
    }

    fn acknowledged_muting_command(
        &self,
        command: impl FnOnce(Sender<()>) -> Command,
    ) -> Result<(), String> {
        self.audio_blockers.fetch_add(1, Ordering::SeqCst);
        self.active.store(false, Ordering::SeqCst);
        let result = self.acknowledged_command(command);
        if result.is_err() {
            self.audio_blockers.fetch_sub(1, Ordering::SeqCst);
        }
        result
    }

    fn acknowledged_command(
        &self,
        command: impl FnOnce(Sender<()>) -> Command,
    ) -> Result<(), String> {
        let (reply, answer) = channel();
        self.control
            .send(command(reply))
            .map_err(|_| "the playback session is no longer running".to_string())?;
        answer
            .recv()
            .map_err(|_| "the playback command stopped before it was applied".to_string())
    }

    pub fn redraw(&self) {
        let _ = self.control.send(Command::Redraw);
    }

    /// Announce a settings request before its potentially slow config build.
    /// The loop holds the same short lock across candidate commit, so an older
    /// build that arrives later cannot become the active picture.
    pub fn reserve_settings_generation(&self, generation: u64) {
        self.shared.settings_order.reserve(generation);
    }

    pub fn has_unconfirmed_settings(&self) -> bool {
        self.shared.settings_order.has_unconfirmed()
    }

    pub fn confirm_settings_generation(&self, generation: u64) {
        let Some(mut order) = self.shared.settings_order.lock_if_current(generation) else {
            return;
        };
        // Keep the live snapshot locked until confirmed is replaced. An
        // automatic proxy commit updates live and then confirmed; letting it
        // cross between clone and overwrite could lose the newly ready path.
        let live = self.shared.live_config.lock().unwrap();
        *self.shared.confirmed_config.lock().unwrap() = live.clone();
        order.confirmed = generation;
    }

    pub fn confirmed_config(&self) -> Config {
        self.shared
            .confirmed_config
            .lock()
            .unwrap()
            .clone()
            .expect("a session starts with a confirmed playback config")
    }

    pub fn set_guides(&self, settings_generation: u64, guides: Guides) -> Result<Status, String> {
        if self.stopped.load(Ordering::Relaxed) {
            return Err("the playback session has stopped".into());
        }
        let generation = self
            .shared
            .requested_generation
            .fetch_add(1, Ordering::Relaxed)
            + 1;
        let (reply, answer) = channel();
        self.control
            .send(Command::SetGuides {
                generation,
                settings_generation,
                guides,
                reply,
            })
            .map_err(|_| {
                "the playback session stopped before guides could be updated".to_string()
            })?;
        answer
            .recv_timeout(Duration::from_secs(1))
            .map_err(|_| "the playback session did not update guides in time".to_string())??;
        Ok(self.status())
    }

    /// Warm a new video path against the existing audio clock and switch only
    /// after its first frame has reached the candidate surface.
    pub fn reconfigure(&self, settings_generation: u64, config: Config) -> Result<Status, String> {
        if self.stopped.load(Ordering::Relaxed) {
            return Err("the playback session has stopped".into());
        }
        let generation = self
            .shared
            .requested_generation
            .fetch_add(1, Ordering::Relaxed)
            + 1;
        let (reply, answer) = channel();
        self.shared.reconfiguring.store(true, Ordering::Relaxed);
        if self
            .control
            .send(Command::Reconfigure {
                generation,
                settings_generation,
                config,
                reply,
            })
            .is_err()
        {
            self.shared.reconfiguring.store(false, Ordering::Relaxed);
            return Err("the playback session stopped before it could be reconfigured".into());
        }
        self.wait_for_reconfigure(generation, answer)
    }

    /// Ask the loop to merge newly ready proxy files into whichever explicit
    /// config is current when it handles the command. No stale quality, GPU or
    /// compositor snapshot crosses this boundary.
    pub fn refresh_proxies(&self, proxy_paths: HashMap<String, String>) -> Result<Status, String> {
        if self.stopped.load(Ordering::Relaxed) {
            return Err("the playback session has stopped".into());
        }
        let generation = self
            .shared
            .requested_generation
            .fetch_add(1, Ordering::Relaxed)
            + 1;
        let (reply, answer) = channel();
        self.shared.reconfiguring.store(true, Ordering::Relaxed);
        if self
            .control
            .send(Command::RefreshProxies {
                generation,
                proxy_paths,
                reply,
            })
            .is_err()
        {
            self.shared.reconfiguring.store(false, Ordering::Relaxed);
            return Err("the playback session stopped before proxies could be refreshed".into());
        }
        self.wait_for_reconfigure(generation, answer)
    }

    fn wait_for_reconfigure(
        &self,
        generation: u64,
        answer: Receiver<Result<(), String>>,
    ) -> Result<Status, String> {
        match answer.recv_timeout(RECONFIGURE_TIMEOUT + Duration::from_secs(1)) {
            Ok(Ok(())) => Ok(self.status()),
            Ok(Err(reason)) => Err(reason),
            Err(_) => {
                let _ = self.control.send(Command::CancelReconfigure(generation));
                if self.shared.requested_generation.load(Ordering::Relaxed) == generation {
                    self.shared.reconfiguring.store(false, Ordering::Relaxed);
                }
                Err("the replacement playback path did not answer in time".into())
            }
        }
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
        let visible = apply_session_visibility(
            &self.stopped,
            &self.viewport,
            visible,
            |viewport, visible| viewport.set_visible(visible),
        );
        if !self.stopped.load(Ordering::Relaxed) {
            let command = if visible {
                Command::Show
            } else {
                Command::Hide
            };
            let _ = self.control.send(command);
        }
    }

    /// Stop the loop even when another command still holds an `Arc<Session>`.
    /// Release uses this before dropping the registry handle, so an in-flight
    /// reconfigure cannot keep audio or the native view visibly alive.
    pub fn stop(&self) {
        if self.stopped.swap(true, Ordering::Relaxed) {
            return;
        }
        self.audio_blockers.fetch_add(1, Ordering::SeqCst);
        self.active.store(false, Ordering::SeqCst);
        if let Ok(mut viewport) = self.viewport.try_lock() {
            viewport.set_visible(false);
        }
        let _ = self.control.send(Command::Stop);
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
        self.viewport.lock().unwrap().set_visible(false);
    }

    pub fn status(&self) -> Status {
        Status {
            engine: "native",
            position: self.shared.position(),
            playing: self.shared.playing(),
            generation: self.shared.generation(),
            reconfiguring: self.shared.reconfiguring(),
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

fn apply_session_visibility<T>(
    stopped: &AtomicBool,
    viewport: &Mutex<T>,
    visible: bool,
    apply: impl FnOnce(&mut T, bool),
) -> bool {
    let mut viewport = viewport.lock().unwrap();
    let visible = visible && !stopped.load(Ordering::Relaxed);
    apply(&mut viewport, visible);
    visible
}

impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
        // The view goes last. The surface lives on the loop's thread and the
        // join above is what proves it is gone, so this cannot pull a window
        // out from under a swapchain.
    }
}

struct Loop {
    document: Arc<Mutex<makevideo_edit::Document>>,
    config: Config,
    presenter: Arc<Compositor>,
    sink: SurfaceSink,
    commands: Receiver<Command>,
    shared: Arc<Shared>,
    counters: Arc<Counters>,
    active: Arc<AtomicBool>,
    audio_blockers: Arc<AtomicU64>,
    project: Project,
    frame: i64,
    visibility: MonitorVisibility,
}

/// Presentation remains native for both compositor choices. The GPU path
/// draws the frame's layers directly. The CPU path composes RGBA first, then
/// uploads that one finished layer through a small GPU presenter.
struct MonitorSink<'a> {
    compositor: &'a Compositor,
    surface: &'a mut SurfaceSink,
    width: u32,
    height: u32,
    direct: bool,
    guides: Guides,
    visibility: MonitorVisibility,
}

#[derive(Clone, Copy)]
enum MonitorVisibility {
    Visible,
    Hidden,
}

impl<'a> MonitorSink<'a> {
    fn visible(
        config: &'a Config,
        presenter: &Arc<Compositor>,
        surface: &'a mut SurfaceSink,
    ) -> MonitorSink<'a> {
        Self::with_visibility(config, presenter, surface, MonitorVisibility::Visible)
    }

    fn hidden(
        config: &'a Config,
        presenter: &Arc<Compositor>,
        surface: &'a mut SurfaceSink,
    ) -> MonitorSink<'a> {
        Self::with_visibility(config, presenter, surface, MonitorVisibility::Hidden)
    }

    fn with_visibility(
        config: &'a Config,
        presenter: &Arc<Compositor>,
        surface: &'a mut SurfaceSink,
        visibility: MonitorVisibility,
    ) -> MonitorSink<'a> {
        MonitorSink {
            direct: config.compositor.is_gpu() && Arc::ptr_eq(&config.compositor, presenter),
            compositor: &config.compositor,
            surface,
            width: config.width,
            height: config.height,
            guides: config.guides,
            visibility,
        }
    }

    fn finish_present(&self) -> Result<(), String> {
        match self.surface.present_outcome() {
            PresentOutcome::Presented => Ok(()),
            PresentOutcome::Deferred => Err(PRESENT_DEFERRED.into()),
            PresentOutcome::Hidden => Err(PRESENT_HIDDEN.into()),
        }
    }

    fn ensure_visible(&self) -> Result<(), String> {
        match self.visibility {
            MonitorVisibility::Visible => Ok(()),
            MonitorVisibility::Hidden => Err(PRESENT_HIDDEN.into()),
        }
    }
}

impl Sink for MonitorSink<'_> {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        self.ensure_visible()?;
        if self.direct {
            self.surface.set_frame_size(self.width, self.height);
            self.surface.set_guides(self.guides);
            self.surface.show(frame)?;
            return self.finish_present();
        }
        let pixels = self
            .compositor
            .compose(self.width, self.height, &frame.sources())?;
        let uploaded = Frame {
            frame: frame.frame,
            layers: vec![Layer {
                clip_id: "monitor-cpu-composite".into(),
                pixels,
                dst: Rect {
                    x: 0,
                    y: 0,
                    w: self.width,
                    h: self.height,
                },
                opacity: 1.0,
                lut: None,
            }],
            visuals: Vec::new(),
        };
        self.surface.set_frame_size(self.width, self.height);
        self.surface.set_guides(self.guides);
        self.surface.show(&uploaded)?;
        self.finish_present()
    }

    fn clear(&mut self) -> Result<(), String> {
        self.ensure_visible()?;
        self.surface.set_frame_size(self.width, self.height);
        self.surface.set_guides(self.guides);
        self.surface.clear()?;
        self.finish_present()
    }
}

fn monitor_sink<'a>(
    config: &'a Config,
    presenter: &Arc<Compositor>,
    surface: &'a mut SurfaceSink,
    visibility: MonitorVisibility,
) -> MonitorSink<'a> {
    match visibility {
        MonitorVisibility::Visible => MonitorSink::visible(config, presenter, surface),
        MonitorVisibility::Hidden => MonitorSink::hidden(config, presenter, surface),
    }
}

struct PendingReconfigure {
    generation: u64,
    owner: ReplacementOwner,
    config: Config,
    project: Project,
    reply: Sender<Result<(), String>>,
    deadline: Instant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReplacementOwner {
    Settings(u64),
    ProxyRefresh,
}

impl ReplacementOwner {
    fn settings_generation(self) -> Option<u64> {
        match self {
            ReplacementOwner::Settings(generation) => Some(generation),
            ReplacementOwner::ProxyRefresh => None,
        }
    }
}

/// Decoder, audio mixer and output device that survive play/pause toggles.
struct Pipeline {
    transport: Transport,
    /// Held for the whole monitor lifetime. Its callback emits silence when
    /// `active` is false instead of consuming the ring.
    _device: DeviceSink,
    active: Arc<AtomicBool>,
}

fn sync_audio_active(pipeline: &Pipeline, audio_blockers: &AtomicU64) {
    let ready = pipeline.transport.is_playing() && pipeline.transport.audio_ready();
    if !ready || audio_blockers.load(Ordering::SeqCst) != 0 {
        pipeline.active.store(false, Ordering::SeqCst);
        return;
    }
    pipeline.active.store(true, Ordering::SeqCst);
    // A caller can close the gate between the check and the store above.
    // Recheck after opening so every interleaving ends closed when a command
    // is pending.
    if audio_blockers.load(Ordering::SeqCst) != 0 {
        pipeline.active.store(false, Ordering::SeqCst);
    }
}

fn run(mut state: Loop) {
    let frame = state.frame;
    let mut current = pipeline(&mut state, frame);
    let mut pending: Option<PendingReconfigure> = None;
    let mut latest_generation = 0;
    loop {
        match state.commands.try_recv() {
            Ok(Command::Stop) | Err(TryRecvError::Disconnected) => {
                if let Some(candidate) = pending.take() {
                    let _ = candidate.reply.send(Err(
                        "the playback session stopped during reconfiguration".into(),
                    ));
                }
                break;
            }
            Ok(Command::Play(reply)) => {
                current.transport.play();
                state.shared.playing.store(true, Ordering::Relaxed);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                sync_audio_active(&current, &state.audio_blockers);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Pause(reply)) => {
                current.active.store(false, Ordering::SeqCst);
                current.transport.pause();
                state.shared.playing.store(false, Ordering::Relaxed);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                state.audio_blockers.fetch_sub(1, Ordering::SeqCst);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Seek(frame, reply)) => {
                // Close the callback gate before the asynchronous decoder sees
                // the seek. Until its flush arrives the ring still contains
                // samples from the position being left.
                current.active.store(false, Ordering::SeqCst);
                current.transport.seek(frame);
                state
                    .shared
                    .position
                    .store(current.transport.position(), Ordering::Relaxed);
                state.audio_blockers.fetch_sub(1, Ordering::SeqCst);
                let _ = reply.send(());
                continue;
            }
            Ok(Command::Resize(width, height)) => {
                state.sink.resize(width, height);
                continue;
            }
            Ok(Command::Show) => {
                state.visibility = MonitorVisibility::Visible;
                current.transport.redraw_video();
                continue;
            }
            Ok(Command::Hide) => {
                state.visibility = MonitorVisibility::Hidden;
                continue;
            }
            Ok(Command::Redraw) => {
                if !current.transport.is_playing() {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        "the timeline changed while the replacement was preparing",
                    );
                    let at = current.transport.position();
                    current.active.store(false, Ordering::SeqCst);
                    state.project = makevideo_proxy::playback_project(
                        state.document.lock().unwrap().project(),
                        &state.config.proxy_paths,
                    );
                    current = pipeline(&mut state, at);
                }
                continue;
            }
            Ok(Command::Reconfigure {
                generation,
                settings_generation,
                mut config,
                reply,
            }) => {
                if state
                    .shared
                    .settings_order
                    .lock_if_current(settings_generation)
                    .is_none()
                {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                }
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                }
                let reason = if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.owner == ReplacementOwner::ProxyRefresh)
                {
                    EXPLICIT_RECONFIGURE_PENDING
                } else {
                    SETTINGS_SUPERSEDED
                };
                cancel_pending(&mut current.transport, &mut pending, &state.shared, reason);
                merge_active_proxy_paths(&mut config, &state.config);
                let project = prepare_candidate(&mut current.transport, &state.document, &config);
                pending = Some(PendingReconfigure {
                    generation,
                    owner: ReplacementOwner::Settings(settings_generation),
                    config,
                    project,
                    reply,
                    deadline: Instant::now() + RECONFIGURE_TIMEOUT,
                });
                state.shared.reconfiguring.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::RefreshProxies {
                generation,
                proxy_paths,
                reply,
            }) => {
                if !proxy_refresh_allowed(pending.as_ref().map(|candidate| candidate.owner)) {
                    let _ = reply.send(Err(EXPLICIT_RECONFIGURE_PENDING.into()));
                    continue;
                }
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(EXPLICIT_RECONFIGURE_PENDING.into()));
                    continue;
                }
                cancel_pending_with_result(
                    &mut current.transport,
                    &mut pending,
                    &state.shared,
                    Ok(()),
                );
                let config = refreshed_proxy_config(&state.config, proxy_paths);
                if config.proxy_paths == state.config.proxy_paths {
                    state.shared.reconfiguring.store(false, Ordering::Relaxed);
                    let _ = reply.send(Ok(()));
                    continue;
                }
                let project = prepare_candidate(&mut current.transport, &state.document, &config);
                pending = Some(PendingReconfigure {
                    generation,
                    owner: ReplacementOwner::ProxyRefresh,
                    config,
                    project,
                    reply,
                    deadline: Instant::now() + RECONFIGURE_TIMEOUT,
                });
                state.shared.reconfiguring.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::CancelReconfigure(generation)) => {
                if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.generation == generation)
                {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        "the replacement playback request timed out",
                    );
                }
                continue;
            }
            Ok(Command::SetGuides {
                generation,
                settings_generation,
                guides,
                reply,
            }) => {
                let Some(mut settings_guard) = state
                    .shared
                    .settings_order
                    .lock_if_current(settings_generation)
                else {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    state
                        .shared
                        .reconfiguring
                        .store(pending.is_some(), Ordering::Relaxed);
                    continue;
                };
                if !accept_generation(&mut latest_generation, generation) {
                    let _ = reply.send(Err(SETTINGS_SUPERSEDED.into()));
                    continue;
                }
                let reason = if pending
                    .as_ref()
                    .is_some_and(|candidate| candidate.owner == ReplacementOwner::ProxyRefresh)
                {
                    EXPLICIT_RECONFIGURE_PENDING
                } else {
                    SETTINGS_SUPERSEDED
                };
                cancel_pending(&mut current.transport, &mut pending, &state.shared, reason);
                state.config.guides = guides;
                state.sink.set_guides(guides);
                current.transport.redraw_video();
                state.shared.set_live_config(&state.config);
                settings_guard.committed = settings_generation;
                let _ = reply.send(Ok(()));
                continue;
            }
            Err(TryRecvError::Empty) => {}
        }

        if pending.as_ref().is_some_and(|candidate| {
            candidate
                .owner
                .settings_generation()
                .is_some_and(|generation| {
                    state
                        .shared
                        .settings_order
                        .lock_if_current(generation)
                        .is_none()
                })
        }) {
            cancel_pending(
                &mut current.transport,
                &mut pending,
                &state.shared,
                SETTINGS_SUPERSEDED,
            );
            continue;
        }

        let tick = {
            let mut sink = monitor_sink(
                &state.config,
                &state.presenter,
                &mut state.sink,
                state.visibility,
            );
            current.transport.tick(&mut sink)
        };
        state
            .shared
            .position
            .store(current.transport.position(), Ordering::Relaxed);

        if tick != Tick::Ended {
            sync_audio_active(&current, &state.audio_blockers);
        }

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
                    current.active.store(false, Ordering::SeqCst);
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

        if pending
            .as_ref()
            .is_some_and(|candidate| Instant::now() >= candidate.deadline)
        {
            cancel_pending(
                &mut current.transport,
                &mut pending,
                &state.shared,
                "the replacement playback path did not present a frame in time",
            );
            continue;
        }

        let settings_generation = pending
            .as_ref()
            .and_then(|candidate| candidate.owner.settings_generation());
        let mut settings_guard = match settings_generation {
            Some(generation) => match state.shared.settings_order.lock_if_current(generation) {
                Some(guard) => Some(guard),
                None => {
                    cancel_pending(
                        &mut current.transport,
                        &mut pending,
                        &state.shared,
                        SETTINGS_SUPERSEDED,
                    );
                    continue;
                }
            },
            None => None,
        };
        let replacement = pending.as_ref().map(|candidate| {
            let mut sink = monitor_sink(
                &candidate.config,
                &state.presenter,
                &mut state.sink,
                state.visibility,
            );
            current.transport.tick_video_replacement(&mut sink)
        });
        match replacement {
            Some(VideoReplacement::Committed(tick)) => {
                let candidate = pending.take().expect("a replacement just committed");
                state.config = candidate.config;
                state.project = candidate.project;
                state.shared.set_live_config(&state.config);
                if candidate.owner == ReplacementOwner::ProxyRefresh {
                    state.shared.set_confirmed_proxy_paths(&state.config);
                }
                state
                    .shared
                    .generation
                    .store(candidate.generation, Ordering::Relaxed);
                if let (Some(generation), Some(guard)) = (
                    candidate.owner.settings_generation(),
                    settings_guard.as_mut(),
                ) {
                    guard.committed = generation;
                }
                state.shared.reconfiguring.store(false, Ordering::Relaxed);
                if let Tick::Presented {
                    present_ms,
                    late_ms,
                    ..
                } = tick
                {
                    state.counters.presented.fetch_add(1, Ordering::Relaxed);
                    state.counters.record_present(present_ms, late_ms);
                } else if tick == Tick::Ended && current.transport.is_playing() {
                    current.active.store(false, Ordering::SeqCst);
                    current.transport.pause();
                    state.shared.playing.store(false, Ordering::Relaxed);
                }
                let _ = candidate.reply.send(Ok(()));
            }
            Some(VideoReplacement::Failed(reason)) => {
                let candidate = pending.take().expect("a replacement just failed");
                state
                    .sink
                    .set_frame_size(state.config.width, state.config.height);
                state.sink.set_guides(state.config.guides);
                state.shared.reconfiguring.store(false, Ordering::Relaxed);
                let _ = candidate.reply.send(Err(reason));
            }
            Some(VideoReplacement::Pending) | None => {}
        }
        drop(settings_guard);
    }
    state.shared.reconfiguring.store(false, Ordering::Relaxed);
}

fn cancel_pending(
    transport: &mut Transport,
    pending: &mut Option<PendingReconfigure>,
    shared: &Shared,
    reason: &str,
) {
    cancel_pending_with_result(transport, pending, shared, Err(reason.to_string()));
}

fn cancel_pending_with_result(
    transport: &mut Transport,
    pending: &mut Option<PendingReconfigure>,
    shared: &Shared,
    result: Result<(), String>,
) {
    transport.cancel_video_replacement();
    if let Some(candidate) = pending.take() {
        let _ = candidate.reply.send(result);
    }
    shared.reconfiguring.store(false, Ordering::Relaxed);
}

fn prepare_candidate(
    transport: &mut Transport,
    document: &Arc<Mutex<makevideo_edit::Document>>,
    config: &Config,
) -> Project {
    let project =
        makevideo_proxy::playback_project(document.lock().unwrap().project(), &config.proxy_paths);
    transport.prepare_video(VideoSetup {
        project: &project,
        width: config.width,
        height: config.height,
        frame_buffering: config.frame_buffering,
        frame_readers: Arc::new(FrameReaders::new(&config.ffmpeg, config.hwaccel.as_deref())),
        resync_after: config.resync_after,
    });
    project
}

fn accept_generation(latest: &mut u64, generation: u64) -> bool {
    if generation <= *latest {
        return false;
    }
    *latest = generation;
    true
}

fn proxy_refresh_allowed(pending: Option<ReplacementOwner>) -> bool {
    !matches!(pending, Some(ReplacementOwner::Settings(_)))
}

fn refreshed_proxy_config(active: &Config, proxy_paths: HashMap<String, String>) -> Config {
    let mut config = active.clone();
    config.proxy_paths = if config.proxy_enabled {
        proxy_paths
    } else {
        HashMap::new()
    };
    config
}

fn merge_active_proxy_paths(candidate: &mut Config, active: &Config) {
    if !candidate.proxy_enabled {
        candidate.proxy_paths.clear();
        return;
    }
    candidate.proxy_paths.extend(active.proxy_paths.clone());
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
    let active = Arc::clone(&state.active);
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

    #[test]
    fn a_later_generation_supersedes_pending_and_stale_work_cannot_return() {
        let mut latest = 0;
        assert!(accept_generation(&mut latest, 1));
        assert!(accept_generation(&mut latest, 3));
        assert!(!accept_generation(&mut latest, 2));
        assert!(!accept_generation(&mut latest, 3));
        assert_eq!(latest, 3);
    }

    #[test]
    fn a_slow_older_settings_build_cannot_commit_after_a_newer_generation() {
        let order = Arc::new(SettingsOrder::default());
        order.reserve(1);
        let (release, delayed) = std::sync::mpsc::channel();
        let (sent, answer) = std::sync::mpsc::channel();
        let worker_order = Arc::clone(&order);
        let worker = std::thread::spawn(move || {
            delayed.recv().unwrap();
            sent.send(worker_order.lock_if_current(1).is_some())
                .unwrap();
        });

        order.reserve(2);
        release.send(()).unwrap();
        assert_eq!(answer.recv().unwrap(), false);
        worker.join().unwrap();
    }

    #[test]
    fn settings_reservation_cannot_cross_a_candidate_commit_lock() {
        let order = Arc::new(SettingsOrder::default());
        order.reserve(1);
        let commit = order.lock_if_current(1).unwrap();
        let (sent, answer) = std::sync::mpsc::channel();
        let worker_order = Arc::clone(&order);
        let worker = std::thread::spawn(move || {
            worker_order.reserve(2);
            sent.send(()).unwrap();
        });

        assert!(answer.recv_timeout(Duration::from_millis(10)).is_err());
        drop(commit);
        assert_eq!(answer.recv_timeout(Duration::from_secs(1)), Ok(()));
        worker.join().unwrap();
    }

    #[test]
    fn committed_settings_remain_unconfirmed_until_persistence_succeeds() {
        let order = SettingsOrder::default();
        order.reserve(1);
        {
            let mut commit = order.lock_if_current(1).unwrap();
            commit.committed = 1;
        }
        assert!(order.has_unconfirmed());

        order.reserve(2);
        {
            let mut restore = order.lock_if_current(2).unwrap();
            restore.committed = 2;
        }
        order.lock_if_current(2).unwrap().confirmed = 2;
        assert!(!order.has_unconfirmed());
    }

    #[test]
    fn confirmed_config_survives_an_unpersisted_live_commit() {
        let compositor =
            Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
        let confirmed = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 1920, 1080);
        let live = Config::new(compositor, "ffmpeg".into(), 960, 540);
        let shared = Shared::default();
        shared.initialize_config(&confirmed);
        shared.settings_order.reserve(1);
        {
            let mut commit = shared.settings_order.lock_if_current(1).unwrap();
            shared.set_live_config(&live);
            commit.committed = 1;
        }

        shared.settings_order.reserve(2);
        assert!(shared.settings_order.has_unconfirmed());
        let rollback = shared.confirmed_config.lock().unwrap().clone().unwrap();
        assert_eq!((rollback.width, rollback.height), (1920, 1080));
        assert_eq!(
            shared
                .live_config
                .lock()
                .unwrap()
                .as_ref()
                .map(|config| (config.width, config.height)),
            Some((960, 540))
        );
    }

    #[test]
    fn confirmed_rollback_keeps_a_proxy_that_became_ready_during_live_settings() {
        let compositor =
            Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
        let mut old_paths = HashMap::new();
        old_paths.insert("asset".into(), "/proxy/r0.mov".into());
        let confirmed = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 1920, 1080)
            .with_proxies(old_paths);
        let live = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 960, 540)
            .with_proxies(confirmed.proxy_paths.clone());
        let shared = Shared::default();
        shared.initialize_config(&confirmed);
        shared.set_live_config(&live);

        let mut ready_paths = HashMap::new();
        ready_paths.insert("asset".into(), "/proxy/r1.mov".into());
        let refreshed = Config::new(compositor, "ffmpeg".into(), 960, 540)
            .with_proxies(ready_paths);
        shared.set_confirmed_proxy_paths(&refreshed);

        let rollback = shared.confirmed_config.lock().unwrap().clone().unwrap();
        assert_eq!((rollback.width, rollback.height), (1920, 1080));
        assert_eq!(rollback.proxy_paths["asset"], "/proxy/r1.mov");
    }

    #[test]
    fn a_late_visible_command_cannot_undo_release_final_hide() {
        let stopped = AtomicBool::new(true);
        let visible = Mutex::new(false);
        apply_session_visibility(&stopped, &visible, true, |slot, wanted| *slot = wanted);
        assert!(!*visible.lock().unwrap());
    }

    #[test]
    fn automatic_refresh_cannot_supersede_an_explicit_candidate() {
        assert!(!proxy_refresh_allowed(Some(ReplacementOwner::Settings(7))));
        assert!(proxy_refresh_allowed(Some(ReplacementOwner::ProxyRefresh)));
        assert!(proxy_refresh_allowed(None));
    }

    #[test]
    fn proxy_refresh_merges_only_paths_into_the_active_explicit_config() {
        let compositor =
            Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
        let mut old = HashMap::new();
        old.insert("asset".into(), "/proxy/old.mov".into());
        let active = Config::new(compositor, "ffmpeg-new".into(), 960, 540)
            .with_proxies(old)
            .with_guides(Guides {
                center_lines: true,
                ..Guides::default()
            });
        let mut ready = HashMap::new();
        ready.insert("asset".into(), "/proxy/new.mov".into());

        let refreshed = refreshed_proxy_config(&active, ready.clone());
        assert_eq!(refreshed.proxy_paths, ready);
        assert_eq!(refreshed.ffmpeg, "ffmpeg-new");
        assert_eq!((refreshed.width, refreshed.height), (960, 540));
        assert!(refreshed.guides.center_lines);

        let disabled = Config::new(active.compositor, "ffmpeg-new".into(), 960, 540);
        assert!(refreshed_proxy_config(&disabled, ready)
            .proxy_paths
            .is_empty());
    }

    #[test]
    fn explicit_candidate_keeps_proxy_paths_an_auto_refresh_already_committed() {
        let compositor =
            Arc::new(Compositor::with_backend(makevideo_compositor::Backend::Cpu).unwrap());
        let mut active_paths = HashMap::new();
        active_paths.insert("asset".into(), "/proxy/r1.mov".into());
        let active = Config::new(Arc::clone(&compositor), "ffmpeg".into(), 480, 270)
            .with_proxies(active_paths);
        let mut candidate_paths = HashMap::new();
        candidate_paths.insert("asset".into(), "/proxy/r0.mov".into());
        let mut candidate =
            Config::new(compositor, "ffmpeg".into(), 1920, 1080).with_proxies(candidate_paths);

        merge_active_proxy_paths(&mut candidate, &active);
        assert_eq!(candidate.proxy_paths.len(), 1);
        assert_eq!(candidate.proxy_paths["asset"], "/proxy/r1.mov");

        candidate.proxy_enabled = false;
        merge_active_proxy_paths(&mut candidate, &active);
        assert!(candidate.proxy_paths.is_empty());
    }
}
