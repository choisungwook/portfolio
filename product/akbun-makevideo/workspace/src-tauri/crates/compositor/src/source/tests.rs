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
        speed: 1.0,
        preserve_pitch: true,
        denoise: 0.0,
        fade_in: 0,
        fade_out: 0,
        volume_keyframes: Default::default(),
        blend_mode: Default::default(),
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
        transitions: Vec::new(),
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
    use makevideo_render::{
        Paint, ShapeKind, Stroke, VisualContent, VisualItem, VisualStyle, VisualTransform,
    };
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
        animation: Default::default(),
        blend_mode: Default::default(),
        content: VisualContent::Shape {
            shape: ShapeKind::Rectangle,
            visual_style: VisualStyle {
                fills: vec![Paint::solid("#ff0000")],
                stroke: Some(Stroke {
                    color: "#ffffff".into(),
                    width: 1.0,
                }),
                shadow: None,
            },
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
            blend_mode: makevideo_render::BlendMode::Normal,
            lut: None,
            track_order: 0,
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
fn visual_items_stay_on_their_track_in_the_paint_order() {
    let dst = Rect {
        x: 0,
        y: 0,
        w: 1,
        h: 1,
    };
    let frame = Frame {
        frame: 0,
        layers: vec![
            Layer {
                clip_id: "bottom".into(),
                pixels: vec![1, 0, 0, 255],
                dst,
                opacity: 1.0,
                blend_mode: makevideo_render::BlendMode::Normal,
                lut: None,
                track_order: 0,
            },
            Layer {
                clip_id: "top".into(),
                pixels: vec![3, 0, 0, 255],
                dst,
                opacity: 1.0,
                blend_mode: makevideo_render::BlendMode::Normal,
                lut: None,
                track_order: 1,
            },
        ],
        visuals: vec![crate::text::RasterLayer {
            pixels: Arc::from(vec![2, 0, 0, 255]),
            width: 1,
            height: 1,
            lut: None,
            placement: Draw {
                dst,
                opacity: 1.0,
                blend_mode: makevideo_render::BlendMode::Normal,
                adjustment: false,
            },
            track_order: 0,
            z_index: 0,
        }],
    };
    let order: Vec<u8> = frame
        .sources()
        .into_iter()
        .map(|(source, _)| source.rgba[0])
        .collect();
    assert_eq!(order, vec![1, 2, 3]);
}

#[test]
fn overlay_style_masks_corners_and_paints_the_border() {
    let mut pixels = vec![100; 4 * 4 * 4];
    for alpha in pixels.iter_mut().skip(3).step_by(4) {
        *alpha = 255;
    }
    let style = makevideo_render::layout::OverlayStyle {
        corner_radius: 2.0,
        border: Some(makevideo_render::Stroke {
            color: "#ff0000".into(),
            width: 1.0,
        }),
    };

    apply_overlay_style(&mut pixels, 4, 4, &style);

    assert_eq!(pixels[3], 0, "the rounded corner is transparent");
    let top_middle = (1 * 4) as usize;
    assert_eq!(&pixels[top_middle..top_middle + 4], &[255, 0, 0, 255]);
    let centre = ((2 * 4 + 2) * 4) as usize;
    assert_eq!(&pixels[centre..centre + 4], &[100, 100, 100, 255]);
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
