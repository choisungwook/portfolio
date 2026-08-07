//! Native playback in the app: one thread, and what it owns.
//!
//! The scheduling is not here. It is `makevideo_present`, which has no window
//! and no tauri, and is measured headless by `present-soak`. What is here is
//! the wiring: a thread, a command channel, the output device, and the surface
//! the frames land on.
//!
//! # Paused costs nothing
//!
//! There are two stages and they hold different things.
//!
//! | Stage | Holds | Runs |
//! |---|---|---|
//! | Still | a frame source and a dead clock | nothing, once the frame is drawn |
//! | Playing | the transport, the decoders, the output device | the tick loop |
//!
//! Pressing play builds the second and pausing throws it away. That costs a few
//! hundred milliseconds to the first frame — the soak measures it as the
//! startup delay — and it buys something the media element preview never had:
//! a paused editor with no decoder running and no audio device open. The old
//! preview keeps a decoder per clip alive for as long as the project is, which
//! is the caveat the wiki has carried since it was written.
//!
//! It also settles a question that has no good answer otherwise. The audio
//! engine has no pause: the ring is drained by whatever holds the consumer, and
//! the consumer is moved into the device. Stopping the sound therefore means
//! dropping the device, and the device cannot be reopened without the consumer
//! back. Building both together and dropping both together is the shape that
//! has no half state in it.
//!
//! # The still is the same picture as the playback
//!
//! Both stages draw through one `Sink` onto one surface with one shader, so the
//! frame under a stopped playhead and the frames during playback are the same
//! compositor. That is what let the live/exact split go: there is nothing left
//! for a badge to tell apart.

use crate::viewport::{Place, Viewport};
use makevideo_audio::device::DeviceSink;
use makevideo_audio::engine::Options as AudioOptions;
use makevideo_audio::realtime::Clock;
use makevideo_audio::source::{
    Buffering as AudioBuffering, FfmpegReaders as AudioReaders, DEFAULT_DEPTH as AUDIO_DEPTH,
    DEFAULT_LEAD as AUDIO_LEAD,
};
use makevideo_compositor::source::{
    Buffering as FrameBuffering, FfmpegReaders as FrameReaders, FrameSource,
};
use makevideo_compositor::Compositor;
use makevideo_present::player::{Scheduler, Tick, IDLE};
use makevideo_present::schedule::DEFAULT_RESYNC;
use makevideo_present::surface::SurfaceSink;
use makevideo_present::transport::{Setup, Transport};
use makevideo_render::Project;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
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
    /// The panel moved or the window resized. Carried to the loop rather than
    /// done where it was noticed, because only the thread drawing on a surface
    /// may reconfigure it.
    Place(Place),
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
    presented: std::sync::atomic::AtomicU64,
    skipped: std::sync::atomic::AtomicU64,
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
        }
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
        place: Place,
        frame: i64,
    ) -> Result<Session, String> {
        if config.compositor.gpu().is_none() {
            return Err("this machine has no graphics device, so the monitor cannot draw".into());
        }
        let viewport = Viewport::attach(window, place)?;
        let (surface_width, surface_height) = place.surface_size();
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
        let project = document.lock().unwrap().project().clone();

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
    pub fn place(&self, place: Place) {
        self.viewport.lock().unwrap().place(place);
        let _ = self.control.send(Command::Place(place));
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

/// Paused holds a frame source and a clock nobody winds; playing holds the
/// whole transport and the output device.
enum Stage {
    Still(Scheduler),
    Playing {
        transport: Transport,
        /// Never read. Held because dropping it closes the output stream, and
        /// the stream is what turns the ring into sound and the clock into
        /// time. The whole of pausing is this field going out of scope.
        _device: DeviceSink,
    },
}

fn run(mut state: Loop) {
    let mut stage = Stage::Still(still(&state, state.frame));
    loop {
        match state.commands.try_recv() {
            Ok(Command::Stop) | Err(TryRecvError::Disconnected) => break,
            Ok(Command::Play) => {
                let at = position(&stage);
                stage = play(&mut state, at);
                state.shared.playing.store(true, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Pause) => {
                let at = position(&stage);
                // The transport and the device are dropped here, which stops
                // the decoders and closes the output. The still is built from
                // the timeline as it is now, so an edit made while playing is
                // on screen the moment it stops.
                state.project = state.document.lock().unwrap().project().clone();
                stage = Stage::Still(still(&state, at));
                state.shared.playing.store(false, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Seek(frame)) => {
                match &mut stage {
                    Stage::Still(scheduler) => scheduler.seek(frame),
                    Stage::Playing { transport, .. } => transport.seek(frame),
                }
                state.shared.position.store(frame, Ordering::Relaxed);
                continue;
            }
            Ok(Command::Place(place)) => {
                let (width, height) = place.surface_size();
                state.sink.resize(width, height);
                continue;
            }
            Ok(Command::Redraw) => {
                if let Stage::Still(_) = stage {
                    let at = position(&stage);
                    state.project = state.document.lock().unwrap().project().clone();
                    stage = Stage::Still(still(&state, at));
                }
                continue;
            }
            Err(TryRecvError::Empty) => {}
        }

        let tick = match &mut stage {
            Stage::Still(scheduler) => scheduler.tick(&mut state.sink),
            Stage::Playing { transport, .. } => transport.tick(&mut state.sink),
        };
        state
            .shared
            .position
            .store(position(&stage), Ordering::Relaxed);

        match tick {
            Tick::Presented { .. } => {
                state.counters.presented.fetch_add(1, Ordering::Relaxed);
            }
            Tick::Skipped { .. } => {
                state.counters.skipped.fetch_add(1, Ordering::Relaxed);
            }
            Tick::Held { wait } => {
                if !wait.is_zero() {
                    std::thread::sleep(wait);
                }
            }
            Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
            Tick::Idle => std::thread::sleep(REST),
            Tick::Ended => {
                // The timeline is over. Stop where it ended and leave the last
                // frame up, which is what the transport does anyway; going back
                // to the top would lose the place somebody was working at.
                if let Stage::Playing { .. } = stage {
                    let at = position(&stage);
                    state.project = state.document.lock().unwrap().project().clone();
                    stage = Stage::Still(still(&state, at));
                    state.shared.playing.store(false, Ordering::Relaxed);
                }
            }
            Tick::Failed { reason } => {
                // Recorded once and then carried on with. A frame that could
                // not be drawn is a frame missing from the screen, and stopping
                // the sound as well would make a bad monitor into a broken app.
                let mut slot = state.shared.failed.lock().unwrap();
                if slot.is_none() {
                    *slot = Some(reason);
                }
                std::thread::sleep(REST);
            }
            Tick::Resynced { .. } => {}
        }
    }
}

fn position(stage: &Stage) -> i64 {
    match stage {
        Stage::Still(scheduler) => scheduler.position(),
        Stage::Playing { transport, .. } => transport.position(),
    }
}

/// A paused monitor: the frames, and a clock that will never be wound.
///
/// The clock is real and it is never advanced, which is exactly right —
/// `Scheduler` in its paused mode does not read it. Handing it one keeps the
/// type honest without inventing a second kind of scheduler for the case where
/// there is no sound.
fn still(state: &Loop, frame: i64) -> Scheduler {
    let source = FrameSource::new(
        &state.project,
        state.config.width,
        state.config.height,
        state.config.frame_buffering,
        Arc::new(FrameReaders::new(&state.config.ffmpeg, None)),
    );
    let mut scheduler = Scheduler::new(source, Arc::new(Clock::new()), state.config.resync_after);
    scheduler.pause(frame);
    scheduler
}

fn play(state: &mut Loop, frame: i64) -> Stage {
    state.project = state.document.lock().unwrap().project().clone();
    let (mut transport, consumer) = Transport::start(Setup {
        project: &state.project,
        width: state.config.width,
        height: state.config.height,
        frame_buffering: state.config.frame_buffering,
        frame_readers: Arc::new(FrameReaders::new(&state.config.ffmpeg, None)),
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
    let device = DeviceSink::open(consumer, clock);
    transport.play();
    Stage::Playing {
        transport,
        _device: device,
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
}
