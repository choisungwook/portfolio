use super::*;
use crate::schedule::DEFAULT_RESYNC;
use makevideo_compositor::source::{Buffering, CancelRead, FrameReader, Open, Readers};
use makevideo_render::{
    Asset, AssetKind, Clip, Project, ProjectSettings, Track, TrackKind, FORMAT_VERSION,
};
use std::sync::atomic::AtomicUsize;
use std::sync::{Condvar, Mutex};

/// Hands back frames instantly, so what a test measures is the scheduler
/// and never a decoder.
struct Instant0;

impl FrameReader for Instant0 {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        buffer.fill(7);
        true
    }
}

struct Always;

impl Readers for Always {
    fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
        Some(Box::new(Instant0))
    }
}

struct CountingReaders(Arc<AtomicUsize>);

impl Readers for CountingReaders {
    fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
        self.0.fetch_add(1, Ordering::Relaxed);
        Some(Box::new(Instant0))
    }
}

#[derive(Default)]
struct GateState {
    through: i64,
    cancelled: bool,
}

#[derive(Default)]
struct Gate {
    state: Mutex<GateState>,
    wake: Condvar,
}

impl Gate {
    fn allow(&self, through: i64) {
        let mut state = self.state.lock().unwrap();
        state.through = state.through.max(through);
        self.wake.notify_all();
    }

    fn cancel(&self) {
        self.state.lock().unwrap().cancelled = true;
        self.wake.notify_all();
    }
}

struct GatedReader {
    next: i64,
    remaining: i64,
    gate: Arc<Gate>,
}

impl FrameReader for GatedReader {
    fn read(&mut self, buffer: &mut [u8]) -> bool {
        if self.remaining <= 0 {
            return false;
        }
        let mut state = self.gate.state.lock().unwrap();
        while self.next > state.through && !state.cancelled {
            state = self.gate.wake.wait(state).unwrap();
        }
        if state.cancelled {
            return false;
        }
        drop(state);
        buffer.fill(self.next as u8);
        self.next += 1;
        self.remaining -= 1;
        true
    }

    fn cancellation(&self) -> Option<Arc<dyn CancelRead>> {
        Some(Arc::new(GateCancel(Arc::clone(&self.gate))))
    }
}

struct GateCancel(Arc<Gate>);

impl CancelRead for GateCancel {
    fn cancel(&self) {
        self.0.cancel();
    }
}

struct GatedReaders(Arc<Gate>);

impl Readers for GatedReaders {
    fn open(&self, request: &Open) -> Option<Box<dyn FrameReader>> {
        Some(Box::new(GatedReader {
            next: request.in_frame,
            remaining: request.frames,
            gate: Arc::clone(&self.0),
        }))
    }
}

/// Never opens anything, so every clip is dead and every poll starves.
struct Never;

impl Readers for Never {
    fn open(&self, _request: &Open) -> Option<Box<dyn FrameReader>> {
        None
    }
}

#[derive(Default)]
struct Recorder {
    shown: Vec<i64>,
    cleared: usize,
}

impl Sink for Recorder {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        self.shown.push(frame.frame);
        Ok(())
    }

    fn clear(&mut self) -> Result<(), String> {
        self.cleared += 1;
        Ok(())
    }
}

struct Broken;

impl Sink for Broken {
    fn show(&mut self, _frame: &Frame) -> Result<(), String> {
        Err("the surface is gone".into())
    }

    fn clear(&mut self) -> Result<(), String> {
        Err("the surface is gone".into())
    }
}

struct DeferExactOnce {
    exact: i64,
    deferred: bool,
    shown: Vec<i64>,
}

impl Sink for DeferExactOnce {
    fn show(&mut self, frame: &Frame) -> Result<(), String> {
        if frame.frame == self.exact && !self.deferred {
            self.deferred = true;
            return Err(crate::transport::PRESENT_DEFERRED.into());
        }
        self.shown.push(frame.frame);
        Ok(())
    }

    fn clear(&mut self) -> Result<(), String> {
        Ok(())
    }
}

/// 300 frames of 30 fps: ten seconds, one clip, one video track.
fn project() -> Project {
    Project {
        version: FORMAT_VERSION,
        settings: ProjectSettings {
            width: 16,
            height: 16,
            rate: Rate::fps(30),
        },
        assets: vec![Asset {
            id: "a1".into(),
            path: "/m/a1".into(),
            name: "a1".into(),
            kind: AssetKind::Video,
            duration_ms: 10_000,
            width: 16,
            height: 16,
            has_audio: true,
        }],
        tracks: vec![Track {
            id: "V1".into(),
            kind: TrackKind::Video,
            name: "V1".into(),
            clips: vec![Clip {
                id: "c1".into(),
                asset_id: "a1".into(),
                link_group: None,
                lut_path: None,
                start: 0,
                in_point: 0,
                out_point: 300,
                volume: 1.0,
                opacity: 1.0,
                speed: 1.0,
                preserve_pitch: true,
                fade_in: 0,
                fade_out: 0,
                volume_keyframes: Default::default(),
                blend_mode: Default::default(),
            }],
            visual_items: Vec::new(),
            muted: false,
            hidden: false,
            subtitle_style: None,
        }],
        transitions: Vec::new(),
        markers: Vec::new(),
    }
}

fn scheduler(readers: Arc<dyn Readers>) -> (Scheduler, Arc<Clock>) {
    let clock = Arc::new(Clock::new());
    let source = FrameSource::new(&project(), 16, 16, Buffering::new(6, 15), readers);
    (
        Scheduler::new(source, Arc::clone(&clock), DEFAULT_RESYNC),
        clock,
    )
}

/// Put the clock on frame `frame` exactly.
fn park(clock: &Clock, frame: i64) {
    clock.restart(frame_due_samples(frame, Rate::fps(30)) as u64);
}

/// Tick until something other than a starve comes back, so a test is not at
/// the mercy of a decoder thread that has not been scheduled yet.
fn settle(scheduler: &mut Scheduler, sink: &mut dyn Sink) -> Tick {
    for _ in 0..2_000 {
        match scheduler.tick(sink) {
            Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
            other => return other,
        }
    }
    panic!("nothing ever arrived");
}

#[test]
fn a_new_scheduler_draws_the_top_of_the_timeline_without_being_played() {
    let (mut scheduler, _clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 0, .. }
    ));
    assert_eq!(sink.shown, vec![0]);
    // And then it stops. A paused monitor redrawing forever is a GPU busy
    // doing nothing.
    assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    assert_eq!(sink.shown, vec![0]);
}

#[test]
fn a_seek_while_paused_draws_that_frame_and_stops() {
    let (mut scheduler, _clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    scheduler.seek(120);
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 120, .. }
    ));
    assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    assert_eq!(sink.shown, vec![0, 120]);
    assert_eq!(scheduler.position(), 120);

    scheduler.seek(scheduler.position());
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 120, .. }
    ));
    assert_eq!(sink.shown, vec![0, 120, 120]);
    assert_eq!(scheduler.position(), 120);
}

#[test]
fn a_playing_seek_clears_the_unrelated_old_picture_before_waiting() {
    let gate = Arc::new(Gate::default());
    let (mut scheduler, _clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    assert_eq!(sink.shown, vec![0]);

    scheduler.play();
    scheduler.seek(20);
    assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    assert_eq!(sink.cleared, 1);
    assert_eq!(sink.shown, vec![0]);
    assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    assert_eq!(sink.cleared, 1, "the seek clear happens exactly once");
}

#[test]
fn paused_redraw_reuses_the_visible_pixels_without_reopening_a_decoder() {
    let opens = Arc::new(AtomicUsize::new(0));
    let (mut scheduler, _clock) = scheduler(Arc::new(CountingReaders(Arc::clone(&opens))));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    let opened = opens.load(Ordering::Relaxed);

    scheduler.redraw();
    assert!(matches!(
        scheduler.tick(&mut sink),
        Tick::Presented { frame: 0, .. }
    ));
    assert_eq!(opens.load(Ordering::Relaxed), opened);
    assert_eq!(sink.shown, vec![0, 0]);
}

#[test]
fn a_paused_seek_waits_for_the_exact_frame_without_showing_a_neighbor() {
    let gate = Arc::new(Gate::default());
    let (mut scheduler, _clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    sink.shown.clear();

    scheduler.seek(20);
    gate.allow(19);
    for _ in 0..50 {
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(
        sink.shown.is_empty(),
        "no earlier frame may be shown paused"
    );
    gate.allow(20);
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 20, .. }
    ));
    assert_eq!(sink.shown, vec![20]);
}

#[test]
fn play_keeps_a_paused_exact_frame_that_waited_for_a_drawable() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut initial = Recorder::default();
    settle(&mut scheduler, &mut initial);
    scheduler.seek(20);

    let mut sink = DeferExactOnce {
        exact: 20,
        deferred: false,
        shown: Vec::new(),
    };
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let tick = scheduler.tick(&mut sink);
        if matches!(
            tick,
            Tick::Failed { ref reason }
                if reason == crate::transport::PRESENT_DEFERRED
        ) {
            break;
        }
        assert!(std::time::Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(
        scheduler.source.decoder_lifecycle(),
        makevideo_compositor::source::DecoderLifecycle::Idle,
        "retained pixels let a hidden paused surface idle its decoder"
    );
    assert_eq!(
        scheduler.buffer_ceiling(),
        scheduler.source.buffer_ceiling() + scheduler.source.frame_ceiling()
    );
    assert!(scheduler.buffered_bytes() <= scheduler.buffer_ceiling());

    scheduler.play();
    park(&clock, 20);
    assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    assert!(matches!(
        scheduler.tick(&mut sink),
        Tick::Presented { frame: 20, .. }
    ));
    assert_eq!(sink.shown, vec![20]);
    assert_eq!(scheduler.counters.failures.load(Ordering::Relaxed), 0);
}

#[test]
fn play_keeps_a_paused_exact_frame_that_is_still_decoding() {
    let gate = Arc::new(Gate::default());
    let (mut scheduler, clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
    let mut initial = Recorder::default();
    settle(&mut scheduler, &mut initial);
    let mut sink = Recorder::default();

    scheduler.seek(20);
    scheduler.play();
    park(&clock, 35);
    scheduler.settled();
    assert_eq!(scheduler.required_exact(), Some(20));

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    for _ in 0..50 {
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(sink.shown.is_empty(), "paused exact seek has no neighbor");

    gate.allow(20);
    while !sink.shown.contains(&20) {
        assert!(
            std::time::Instant::now() < deadline,
            "exact frame was cancelled by play"
        );
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(sink.shown, vec![20]);
}

#[test]
fn a_seek_neighbor_is_replaced_by_exact_even_after_the_clock_advances() {
    let gate = Arc::new(Gate::default());
    let (mut scheduler, clock) = scheduler(Arc::new(GatedReaders(Arc::clone(&gate))));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    sink.shown.clear();

    scheduler.play();
    scheduler.seek(20);
    park(&clock, 20);
    scheduler.settled();
    gate.allow(18);

    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    while sink.shown.is_empty() {
        assert!(std::time::Instant::now() < deadline, "no neighbor arrived");
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(sink.shown, vec![18]);

    // The target is now late. It must still replace the temporary
    // neighbor once, before ordinary skip-late catch-up resumes.
    park(&clock, 36);
    gate.allow(20);
    while !sink.shown.contains(&20) {
        assert!(
            std::time::Instant::now() < deadline,
            "exact frame was skipped"
        );
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(sink.shown, vec![18, 20]);

    gate.allow(36);
    while !sink.shown.contains(&36) {
        assert!(
            std::time::Instant::now() < deadline,
            "clock frame did not arrive"
        );
        scheduler.tick(&mut sink);
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(sink.shown.last(), Some(&36));
    assert!(
        !(21..36).any(|frame| sink.shown.contains(&frame)),
        "frames between exact 20 and clock 36 are skipped"
    );
}

#[test]
fn a_transient_timeout_retries_exact_before_resyncing_to_a_far_clock() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut initial = Recorder::default();
    settle(&mut scheduler, &mut initial);
    scheduler.play();
    scheduler.seek(20);
    park(&clock, 35);
    scheduler.settled();

    let mut sink = DeferExactOnce {
        exact: 20,
        deferred: false,
        shown: Vec::new(),
    };
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        let tick = scheduler.tick(&mut sink);
        if matches!(
            tick,
            Tick::Failed { ref reason }
                if reason == crate::transport::PRESENT_DEFERRED
        ) {
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "exact frame was never tried"
        );
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(scheduler.seeking_exact, Some(20));
    assert!(!sink.shown.contains(&20));

    while !sink.shown.contains(&20) {
        scheduler.tick(&mut sink);
        assert!(
            std::time::Instant::now() < deadline,
            "exact frame was not retried after timeout"
        );
        std::thread::sleep(Duration::from_millis(1));
    }
    assert_eq!(scheduler.seeking_exact, None);
    assert_eq!(scheduler.counters.failures.load(Ordering::Relaxed), 0);

    let clock_frame = clock_frame(&clock, Rate::fps(30));
    while !sink.shown.contains(&clock_frame) {
        scheduler.tick(&mut sink);
        assert!(
            std::time::Instant::now() < deadline,
            "playback did not catch up after the exact frame"
        );
        std::thread::sleep(Duration::from_millis(1));
    }
    assert!(
        !(21..clock_frame).any(|frame| sink.shown.contains(&frame)),
        "catch-up frames must be skipped, not presented"
    );
}

/// The rule the issue is about. The clock is ten frames on, the source is
/// at the start, and what reaches the screen is frame ten — not ten frames
/// in a row as fast as they can be drawn.
#[test]
fn late_frames_are_skipped_and_the_one_the_clock_is_on_is_drawn() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    sink.shown.clear();

    scheduler.play();
    park(&clock, 10);
    let mut presented = None;
    for _ in 0..4_000 {
        match scheduler.tick(&mut sink) {
            Tick::Presented { frame, .. } => {
                presented = Some(frame);
                break;
            }
            Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
            _ => {}
        }
    }
    assert_eq!(presented, Some(10));
    assert_eq!(sink.shown, vec![10], "only the current frame is drawn");
    // Nine, not ten: frame 0 was drawn by the still before play started, so
    // the source was already at frame 1 and frames 1 to 9 are what was in
    // the way.
    assert_eq!(scheduler.counters().skipped(), 9);
    assert_eq!(scheduler.counters().resyncs(), 0);
}

/// Past the threshold the source jumps instead of walking, and the jump is
/// forward.
#[test]
fn a_long_gap_jumps_the_source_forward() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    scheduler.play();
    park(&clock, 200);
    assert_eq!(scheduler.tick(&mut sink), Tick::Resynced { to: 200 });
    assert_eq!(scheduler.counters().skipped(), 0);
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 200, .. }
    ));
}

#[test]
fn a_frame_whose_turn_has_not_come_holds_without_consuming_anything() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    sink.shown.clear();
    scheduler.play();
    // The source is at frame 1 and the clock has not left frame 0.
    park(&clock, 0);
    for _ in 0..20 {
        assert!(matches!(scheduler.tick(&mut sink), Tick::Held { .. }));
    }
    assert!(sink.shown.is_empty());
    // A hold never waits longer than a command can be left unanswered.
    let Tick::Held { wait } = scheduler.tick(&mut sink) else {
        panic!("expected a hold");
    };
    assert!(wait <= MAX_HOLD, "{wait:?}");
}

/// A seek during playback is answered by the audio engine on its own
/// schedule. Until it is, the clock is still at the old position and the
/// scheduler must not act on it.
#[test]
fn nothing_is_judged_while_a_play_seek_is_settling() {
    let (mut scheduler, clock) = scheduler(Arc::new(Always));
    let mut sink = Recorder::default();
    settle(&mut scheduler, &mut sink);
    sink.shown.clear();
    scheduler.play();
    park(&clock, 250);
    scheduler.seek(30);
    for _ in 0..50 {
        assert_eq!(scheduler.tick(&mut sink), Tick::Idle);
    }
    assert!(sink.shown.is_empty(), "nothing drawn while settling");
    assert_eq!(scheduler.counters().skipped(), 0, "and nothing skipped");

    park(&clock, 30);
    scheduler.settled();
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 30, .. }
    ));
}

#[test]
fn a_starved_poll_consumes_nothing_and_is_counted() {
    let (mut scheduler, _clock) = scheduler(Arc::new(Never));
    let mut sink = Recorder::default();
    // Every clip is dead, so the frame arrives as a frame with no layers
    // rather than never: a source that cannot be opened leaves a hole and
    // playback runs on. That is the frame source's rule and this only has
    // to not fight it.
    assert!(matches!(
        settle(&mut scheduler, &mut sink),
        Tick::Presented { frame: 0, .. }
    ));
}

/// A surface that has gone away must not stop the sound. The tick reports
/// it and the next one carries on.
#[test]
fn a_sink_that_refuses_does_not_stop_playback() {
    let (mut scheduler, _clock) = scheduler(Arc::new(Always));
    let mut broken = Broken;
    let mut seen = false;
    for _ in 0..2_000 {
        match scheduler.tick(&mut broken) {
            Tick::Failed { .. } => {
                seen = true;
                break;
            }
            Tick::Starved => std::thread::sleep(Duration::from_millis(1)),
            _ => {}
        }
    }
    assert!(seen, "the failure should have been reported");
    assert_eq!(scheduler.counters().failures(), 1);
    // Playing still works: the clock is followed and frames are consumed.
    scheduler.play();
    assert!(!matches!(scheduler.tick(&mut broken), Tick::Idle));
}

#[test]
fn the_clock_floors_rather_than_rounding_to_the_nearest_frame() {
    let rate = Rate::fps(30);
    let clock = Clock::new();
    // Just under half a frame in: still frame 0, and a rounding conversion
    // would already say 1 at 800 samples.
    clock.restart(700);
    assert_eq!(clock_frame(&clock, rate), 0);
    clock.restart(900);
    assert_eq!(clock_frame(&clock, rate), 0);
    clock.restart(1_600);
    assert_eq!(clock_frame(&clock, rate), 1);
    // And exactly on a boundary is the frame that starts there.
    clock.restart(frame_due_samples(7, rate) as u64);
    assert_eq!(clock_frame(&clock, rate), 7);
}

/// 29.97 is a ratio and not 29.97, so the conversion has to stay in
/// integers all the way. Ten thousand frames in, the floor must still land
/// on ten thousand rather than 9,999.
#[test]
fn a_broadcast_rate_lands_on_its_own_frames() {
    let rate = Rate::ntsc(30);
    let clock = Clock::new();
    for frame in [0i64, 1, 999, 1_000, 9_999, 10_000] {
        clock.restart(frame_due_samples(frame, rate) as u64);
        assert_eq!(clock_frame(&clock, rate), frame, "frame {frame}");
    }
}
